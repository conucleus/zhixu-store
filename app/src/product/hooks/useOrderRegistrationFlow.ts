import { useState } from "react";
import type { ProductApiClient, ProductOrderDraftDTO } from "../api";
import { requestWalletAccount, signTypedData, WalletNotConnectedError, WalletRejectedError } from "../wallet";
import { idleAction, type ActionState } from "./workbenchTypes";
import { readableError } from "./workbenchSupport";

export function useOrderRegistrationFlow(input: {
  readonly api: ProductApiClient;
  readonly ensureDraft: () => Promise<ProductOrderDraftDTO | undefined>;
  readonly onRegistered: (draft: ProductOrderDraftDTO) => void;
}): {
  readonly registerDraftAction: ActionState;
  readonly handleRegisterDraft: () => Promise<void>;
} {
  const { api, ensureDraft, onRegistered } = input;
  const [registerDraftAction, setRegisterDraftAction] = useState<ActionState>(idleAction);

  async function handleRegisterDraft(): Promise<void> {
    const currentDraft = await ensureDraft();
    if (!currentDraft) {
      return;
    }
    try {
      setRegisterDraftAction({ phase: "pending", message: "正在准备订单启动签名" });
      const account = await requestWalletAccount();
      const prepared = await api.prepareOrderTrigger(currentDraft.draftId, { walletAddress: account.address });
      setRegisterDraftAction({ phase: "pending", message: "等待钱包授权", source: prepared.source });
      // 与 executor-kit 同边界：签名前校验启动签名对象的 primaryType、domain 和 submitter。
      const signature = await signTypedData(account, prepared.data.typedData, {
        primaryType: "UVPStateMachineTriggerOrderFromOutside",
        domainName: "UVPStateMachine",
        domainVersion: "0.9",
        submitter: account.address,
        preparedSubmitters: [prepared.data.submitter]
      });
      const result = await api.triggerOrder(currentDraft.draftId, {
        prepareId: prepared.data.prepareId,
        signature,
        walletAddress: account.address
      });
      setRegisterDraftAction({ phase: "success", message: "订单已启动，正在等待订单页同步", source: result.source });
      onRegistered(result.data);
    } catch (error) {
      if (error instanceof WalletNotConnectedError) {
        setRegisterDraftAction({ phase: "error", message: "请连接浏览器钱包后再启动订单" });
        return;
      }
      if (error instanceof WalletRejectedError) {
        setRegisterDraftAction({ phase: "error", message: "你取消了签名，可以重新启动" });
        return;
      }
      setRegisterDraftAction({ phase: "error", message: readableError(error, "订单启动失败") });
    }
  }

  return { registerDraftAction, handleRegisterDraft };
}
