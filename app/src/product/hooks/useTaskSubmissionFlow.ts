import { useState } from "react";
import type { ProductTaskDTO } from "@uvp-eth/product-dto";
import type {
  EvidenceObjectDTO,
  EvidenceProofDTO,
  PreparedSubmitDTO,
  ProductApiClient,
  ProductApiSource
} from "../api";
import { requestWalletAccount, signTypedData, WalletNotConnectedError, WalletRejectedError } from "../wallet";
import { idleAction, type ActionState, type SubmitMachineState } from "./workbenchTypes";
import { delay, readableError } from "./workbenchSupport";

export function useTaskSubmissionFlow(input: {
  readonly api: ProductApiClient;
  readonly activeTask?: ProductTaskDTO;
  readonly allowMockWallet: boolean;
}): {
  readonly evidence?: EvidenceObjectDTO;
  readonly evidenceProof?: EvidenceProofDTO;
  readonly evidenceAction: ActionState;
  readonly submitMachine: SubmitMachineState;
  readonly disputeAction: ActionState;
  readonly handleUploadEvidence: (file: File) => Promise<void>;
  readonly handleUploadDemoEvidence: () => Promise<void>;
  readonly handleConfirmSubmit: (options?: { readonly rejectWallet?: boolean }) => Promise<void>;
  readonly handleDisputeSave: () => Promise<void>;
} {
  const { api, activeTask, allowMockWallet } = input;
  const [evidence, setEvidence] = useState<EvidenceObjectDTO | undefined>();
  const [evidenceProof, setEvidenceProof] = useState<EvidenceProofDTO | undefined>();
  const [evidenceAction, setEvidenceAction] = useState<ActionState>(idleAction);
  const [submitMachine, setSubmitMachine] = useState<SubmitMachineState>({
    status: "idle",
    message: "等待上传凭证并确认提交"
  });
  const [disputeAction, setDisputeAction] = useState<ActionState>(idleAction);

  async function handleUploadEvidence(file: File): Promise<void> {
    if (!activeTask) {
      setEvidenceAction({ phase: "error", message: "暂无可处理的待办" });
      return;
    }
    setEvidenceAction({ phase: "pending", message: "正在上传凭证并生成指纹" });
    try {
      const result = await api.uploadEvidence({
        file,
        orderId: activeTask.orderId,
        taskId: activeTask.taskId,
        stageIdentifier: activeTask.stageId,
        documentType: "customs_declaration",
        metadata: {
          businessLabel: "报关单",
          documentType: "customs_declaration",
          fields: {
            stage: activeTask.stageName
          }
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

  async function handleUploadDemoEvidence(): Promise<void> {
    await handleUploadEvidence(new File(["customs declaration demo"], "出口报关单_20260430.pdf", { type: "application/pdf" }));
  }

  async function handleConfirmSubmit(options: { readonly rejectWallet?: boolean } = {}): Promise<void> {
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
      const account = await requestWalletAccount(allowMockWallet);
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
      const signature = await signTypedData(account, preparedResult.data.typedData, {
        allowMock: allowMockWallet,
        reject: options.rejectWallet
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
  }

  async function handleDisputeSave(): Promise<void> {
    setDisputeAction({ phase: "pending", message: "正在保存争议材料" });
    await delay(600);
    setDisputeAction({ phase: "success", message: "争议材料已保存，平台将继续处理" });
  }

  return {
    evidence,
    evidenceProof,
    evidenceAction,
    submitMachine,
    disputeAction,
    handleUploadEvidence,
    handleUploadDemoEvidence,
    handleConfirmSubmit,
    handleDisputeSave
  };
}
