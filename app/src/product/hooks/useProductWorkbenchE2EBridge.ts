import { useEffect } from "react";
import type { ProductApiSource, ProductWorkbenchData } from "../api";

export interface ProductWorkbenchE2EState {
  readonly mode: string;
  readonly view: string;
  readonly loadStatus: string;
  readonly sourceKind: ProductApiSource["kind"] | null;
  readonly apiBaseUrl: string | null;
  readonly syncState: ProductWorkbenchData["syncState"] | null;
  readonly zhixuId: string | null;
  readonly draftId: string | null;
  readonly orderId: string | null;
  readonly taskId: string | null;
  readonly evidenceId: string | null;
  readonly submissionId: string | null;
  readonly triggerTxHash: string | null;
  readonly signalTxHash: string | null;
}

export interface ProductWorkbenchE2EAcceptResult {
  readonly acceptedCount: number;
  readonly missingRequired: number;
  readonly draftId?: string;
  readonly draftStatus?: string;
}

interface ProductWorkbenchE2EBridge {
  readonly state: ProductWorkbenchE2EState;
  acceptRequiredParticipants(walletAddresses: string | readonly string[]): Promise<ProductWorkbenchE2EAcceptResult>;
}

declare global {
  interface Window {
    __uvpProductWorkbenchE2E?: ProductWorkbenchE2EBridge;
  }
}

export function useProductWorkbenchE2EBridge(input: {
  readonly state: ProductWorkbenchE2EState;
  readonly acceptRequiredParticipants: (walletAddresses: string | readonly string[]) => Promise<ProductWorkbenchE2EAcceptResult>;
}): void {
  const { state, acceptRequiredParticipants } = input;
  useEffect(() => {
    if (import.meta.env.VITE_UVP_PRODUCT_E2E !== "1") {
      return;
    }
    window.__uvpProductWorkbenchE2E = {
      state,
      acceptRequiredParticipants
    };
    return () => {
      delete window.__uvpProductWorkbenchE2E;
    };
  }, [
    acceptRequiredParticipants,
    state.apiBaseUrl,
    state.draftId,
    state.evidenceId,
    state.loadStatus,
    state.mode,
    state.orderId,
    state.signalTxHash,
    state.sourceKind,
    state.submissionId,
    state.syncState,
    state.taskId,
    state.triggerTxHash,
    state.view,
    state.zhixuId
  ]);
}
