import { useState } from "react";
import type { ProductTaskDTO } from "@uvp-eth/product-dto";
import type {
  EvidenceObjectDTO,
  EvidenceProofDTO,
  PreparedSubmitDTO,
  ProductApiClient,
  ProductApiSource
} from "../api";
import {
  requestWalletAccount,
  signTypedData,
  WalletNotConnectedError,
  WalletRejectedError
} from "../wallet";
import { idleAction, type ActionState, type SubmitMachineState } from "./workbenchTypes";
import {
  delay,
  missingTaskEvidenceFieldLabels,
  readableError,
  resolveTaskEvidenceType,
  validateEvidenceFile,
  type TaskEvidenceFieldValues
} from "./workbenchSupport";

export function useTaskSubmissionFlow(input: {
  readonly api: ProductApiClient;
  readonly activeTask?: ProductTaskDTO | undefined;
}): {
  readonly evidence?: EvidenceObjectDTO | undefined;
  readonly evidenceProof?: EvidenceProofDTO | undefined;
  readonly evidenceAction: ActionState;
  readonly submitMachine: SubmitMachineState;
  readonly disputeAction: ActionState;
  readonly handleUploadEvidence: (file: File, fields: TaskEvidenceFieldValues) => Promise<void>;
  readonly handleConfirmSubmit: () => Promise<void>;
  readonly handleDisputeSave: () => Promise<void>;
} {
  const { api, activeTask } = input;
  const [evidence, setEvidence] = useState<EvidenceObjectDTO | undefined>();
  const [evidenceProof, setEvidenceProof] = useState<EvidenceProofDTO | undefined>();
  const [evidenceAction, setEvidenceAction] = useState<ActionState>(idleAction);
  const [submitMachine, setSubmitMachine] = useState<SubmitMachineState>({
    status: "idle",
    message: "等待上传凭证并确认提交"
  });
  const [disputeAction, setDisputeAction] = useState<ActionState>(idleAction);

  async function handleUploadEvidence(file: File, fields: TaskEvidenceFieldValues): Promise<void> {
    if (!activeTask) {
      setEvidenceAction({ phase: "error", message: "暂无可处理的待办" });
      return;
    }
    const missingFields = missingTaskEvidenceFieldLabels(fields);
    if (missingFields.length > 0) {
      setEvidenceAction({ phase: "error", message: `请填写必填字段：${missingFields.join("、")}` });
      return;
    }
    const fileError = validateEvidenceFile(file);
    if (fileError) {
      setEvidenceAction({ phase: "error", message: fileError });
      return;
    }
    // 服务端不校验 documentType 与秩序声明的关系；这里必须先解析，解析不出就显式报错，
    // 禁止错标证据元数据（会系统性污染 metadataHash）。
    const evidenceType = resolveTaskEvidenceType(activeTask.requiredEvidence);
    if (evidenceType.status !== "resolved") {
      const reason = evidenceType.status === "empty"
        ? "该待办未声明所需凭证类型"
        : evidenceType.status === "unmapped"
          ? `暂不支持上传「${evidenceType.labels.join("、")}」类凭证：未登记的凭证类型会被错标，已拒绝上传`
          : `该待办要求多种凭证（${evidenceType.labels.join("、")}），当前一次只能绑定一类，请联系维护方拆分阶段声明`;
      setEvidenceAction({ phase: "error", message: reason });
      return;
    }
    setEvidenceAction({ phase: "pending", message: "正在上传凭证并生成指纹" });
    try {
      const metadataFields: Record<string, string> = {
        stage: activeTask.stageName
      };
      if (fields.referenceNo.trim()) {
        metadataFields.reference_no = fields.referenceNo.trim();
      }
      if (fields.exportPort.trim()) {
        metadataFields.export_port = fields.exportPort.trim();
      }
      if (fields.completionDate.trim()) {
        metadataFields.completion_date = fields.completionDate.trim();
      }
      if (fields.notes.trim()) {
        metadataFields.notes = fields.notes.trim();
      }
      const result = await api.uploadEvidence({
        file,
        orderId: activeTask.orderId,
        taskId: activeTask.taskId,
        stageIdentifier: activeTask.stageId,
        documentType: evidenceType.documentType,
        metadata: {
          businessLabel: evidenceType.businessLabel,
          documentType: evidenceType.documentType,
          fields: metadataFields
        }
      });
      setEvidence(result.data);
      const proofResult = await api.getEvidenceProof(result.data.evidenceId);
      setEvidenceProof(proofResult.data);
      setEvidenceAction({ phase: "success", message: "凭证已上传，指纹已生成", source: result.source });
    } catch (error) {
      setEvidenceAction({ phase: "error", message: readableError(error, "凭证上传失败") });
    }
  }

  async function handleConfirmSubmit(): Promise<void> {
    if (!activeTask) {
      setSubmitMachine({ status: "failed", message: "暂无可提交的待办" });
      return;
    }
    if (!evidence) {
      setSubmitMachine({ status: "failed", message: "请先上传凭证并生成指纹" });
      return;
    }
    try {
      setSubmitMachine({ status: "preparing", message: "正在准备签名前摘要" });
      const account = await requestWalletAccount();
      const preparedResult = await api.prepareTaskSubmit(activeTask.taskId, {
        evidenceIds: [evidence.evidenceId],
        walletAddress: account.address,
        intent: "confirm_stage"
      });
      setSubmitMachine({
        status: "signature_pending",
        message: "等待钱包授权",
        prepared: preparedResult.data,
        source: preparedResult.source
      });
      // 与 executor-kit 同边界：签名前校验 typedData 的 primaryType、domain 和 submitter，
      // prepared 记录与 typedData 声明的提交方必须一致，防止换签名对象。
      const signature = await signTypedData(account, preparedResult.data.typedData, {
        primaryType: "UVPStateMachineSignal",
        domainName: "UVPStateMachine",
        domainVersion: "0.8",
        submitter: account.address,
        preparedSubmitters: [preparedResult.data.summary.walletAddress]
      });
      const submissionResult = await api.submitTask(activeTask.taskId, {
        prepareId: preparedResult.data.prepareId,
        signature,
        walletAddress: account.address
      });
      setSubmitMachine({
        status: "tx_pending",
        message: "提交处理中，等待确认",
        prepared: preparedResult.data,
        submission: submissionResult.data,
        source: submissionResult.source
      });
      await pollSubmission(submissionResult.data.submissionId, preparedResult.data, submissionResult.source);
    } catch (error) {
      if (error instanceof WalletNotConnectedError) {
        setSubmitMachine({ status: "wallet_not_connected", message: "请连接浏览器钱包后再确认提交" });
        return;
      }
      if (error instanceof WalletRejectedError) {
        setSubmitMachine({ status: "wallet_rejected", message: "你取消了签名，可以重新提交" });
        return;
      }
      setSubmitMachine({ status: "failed", message: readableError(error, "确认提交失败") });
    }
  }

  async function pollSubmission(submissionId: string, prepared: PreparedSubmitDTO, source: ProductApiSource): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await delay(1100);
      const result = await api.getSubmission(submissionId);
      if (result.data.status === "confirmed") {
        setSubmitMachine({
          status: "confirmed",
          message: "提交已确认，订单页稍后会同步最新状态",
          prepared,
          submission: result.data,
          source: result.source
        });
        return;
      }
      if (result.data.status === "failed") {
        setSubmitMachine({
          status: "failed",
          message: result.data.errorCode ?? "提交失败，可重试",
          prepared,
          submission: result.data,
          source: result.source
        });
        return;
      }
      setSubmitMachine({
        status: "tx_pending",
        message: "提交处理中，等待确认",
        prepared,
        submission: result.data,
        source
      });
    }
    setSubmitMachine({
      status: "failed",
      message: `链上确认超时，请凭提交编号 ${submissionId} 人工核对`,
      prepared,
      source
    });
  }

  async function handleDisputeSave(): Promise<void> {
    setDisputeAction({
      phase: "error",
      message: "争议提交未接入后端，未产生任何记录"
    });
  }

  return {
    evidence,
    evidenceProof,
    evidenceAction,
    submitMachine,
    disputeAction,
    handleUploadEvidence,
    handleConfirmSubmit,
    handleDisputeSave
  };
}
