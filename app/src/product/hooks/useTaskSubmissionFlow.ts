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
  missingTaskEvidenceSlotLabels,
  planTaskEvidence,
  readableError,
  validateEvidenceFileForSlot,
  type TaskEvidenceFieldValues,
  type TaskEvidencePlan
} from "./workbenchSupport";

/** 已上传证据按槽位 key 归档；框架不预置任何业务槽位。 */
export type EvidenceBySlot = Readonly<Record<string, EvidenceObjectDTO>>;
export type EvidenceProofsBySlot = Readonly<Record<string, EvidenceProofDTO>>;

export function useTaskSubmissionFlow(input: {
  readonly api: ProductApiClient;
  readonly activeTask?: ProductTaskDTO | undefined;
}): {
  readonly evidencePlan: TaskEvidencePlan;
  readonly evidenceBySlot: EvidenceBySlot;
  readonly evidenceProofsBySlot: EvidenceProofsBySlot;
  readonly evidenceAction: ActionState;
  readonly submitMachine: SubmitMachineState;
  readonly disputeAction: ActionState;
  readonly handleUploadEvidence: (slotKey: string, file: File, fields: TaskEvidenceFieldValues) => Promise<void>;
  readonly handleConfirmSubmit: () => Promise<void>;
  readonly handleDisputeSave: () => Promise<void>;
} {
  const { api, activeTask } = input;
  const evidencePlan = planTaskEvidence({
    evidenceSpec: activeTask?.evidenceSpec,
    requiredEvidence: activeTask?.requiredEvidence ?? []
  });
  const [evidenceBySlot, setEvidenceBySlot] = useState<EvidenceBySlot>({});
  const [proofsBySlot, setProofsBySlot] = useState<EvidenceProofsBySlot>({});
  const [evidenceAction, setEvidenceAction] = useState<ActionState>(idleAction);
  const [submitMachine, setSubmitMachine] = useState<SubmitMachineState>({
    status: "idle",
    message: "等待上传凭证并确认提交"
  });
  const [disputeAction, setDisputeAction] = useState<ActionState>(idleAction);

  async function handleUploadEvidence(
    slotKey: string,
    file: File,
    fields: TaskEvidenceFieldValues
  ): Promise<void> {
    const slot = evidencePlan.slots.find((item) => item.key === slotKey);
    if (!activeTask || !slot) {
      setEvidenceAction({ phase: "error", message: "暂无可处理的待办" });
      return;
    }
    // 元数据会随上传进入指纹：必填的文本/日期字段缺失时在上传前拦截。
    const uploadedKeys = Object.keys(evidenceBySlot);
    const slotMissing = missingTaskEvidenceSlotLabels(
      evidencePlan.slots.filter((item) => item.inputKind !== "file"),
      fields,
      uploadedKeys
    );
    if (slotMissing.length > 0) {
      setEvidenceAction({ phase: "error", message: `请填写必填字段：${slotMissing.join("、")}` });
      return;
    }
    const fileError = await validateEvidenceFileForSlot(file, slot);
    if (fileError) {
      setEvidenceAction({ phase: "error", message: fileError });
      return;
    }
    setEvidenceAction({ phase: "pending", message: "正在上传凭证并生成指纹" });
    try {
      const metadataFields: Record<string, string> = {
        stage: activeTask.stageName
      };
      // 字段 key 全部来自凝结核配置（spec）；fallback 模式只携带通用备注与
      // 原样声明的凭证要求文本，框架不携带任何业务字段名。
      for (const [key, value] of Object.entries(fields)) {
        const trimmed = value.trim();
        if (trimmed) {
          metadataFields[key] = trimmed;
        }
      }
      if (evidencePlan.mode === "fallback" && evidencePlan.declaredLabels.length > 0) {
        metadataFields.declared_requirements = evidencePlan.declaredLabels.join(", ");
      }
      const result = await api.uploadEvidence({
        file,
        orderId: activeTask.orderId,
        taskId: activeTask.taskId,
        stageIdentifier: activeTask.stageId,
        documentType: slot.key,
        metadata: {
          businessLabel: slot.label,
          documentType: slot.key,
          fields: metadataFields
        }
      });
      setEvidenceBySlot((current) => ({ ...current, [slot.key]: result.data }));
      const proofResult = await api.getEvidenceProof(result.data.evidenceId);
      setProofsBySlot((current) => ({ ...current, [slot.key]: proofResult.data }));
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
    const uploadedEntries = Object.entries(evidenceBySlot);
    if (uploadedEntries.length === 0) {
      setSubmitMachine({ status: "failed", message: "请先上传凭证并生成指纹" });
      return;
    }
    const missingRequiredFiles = evidencePlan.slots.filter(
      (slot) => slot.inputKind === "file" && slot.required && !evidenceBySlot[slot.key]
    );
    if (missingRequiredFiles.length > 0) {
      setSubmitMachine({
        status: "failed",
        message: `请先上传必需凭证：${missingRequiredFiles.map((slot) => slot.label).join("、")}`
      });
      return;
    }
    try {
      setSubmitMachine({ status: "preparing", message: "正在准备签名前摘要" });
      const account = await requestWalletAccount();
      const preparedResult = await api.prepareTaskSubmit(activeTask.taskId, {
        evidenceIds: uploadedEntries.map(([, value]) => value.evidenceId),
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
    evidencePlan,
    evidenceBySlot,
    evidenceProofsBySlot: proofsBySlot,
    evidenceAction,
    submitMachine,
    disputeAction,
    handleUploadEvidence,
    handleConfirmSubmit,
    handleDisputeSave
  };
}
