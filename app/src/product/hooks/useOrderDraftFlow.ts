import { useState, type Dispatch, type SetStateAction } from "react";
import type { ZhixuDetailDTO } from "@uvp-eth/product-dto";
import type {
  DraftParticipantDTO,
  ProductApiClient,
  ProductInviteDTO,
  ProductOrderDraftDTO
} from "../api";
import { idleAction, type ActionState } from "./workbenchTypes";
import { readableError } from "./workbenchSupport";
import type { ProductWorkbenchE2EAcceptResult } from "./useProductWorkbenchE2EBridge";

export function useOrderDraftFlow(input: {
  readonly api: ProductApiClient;
  readonly selectedZhixu?: ZhixuDetailDTO | undefined;
}): {
  readonly draft?: ProductOrderDraftDTO | undefined;
  readonly setDraft: Dispatch<SetStateAction<ProductOrderDraftDTO | undefined>>;
  readonly draftParticipants: readonly DraftParticipantDTO[];
  readonly setDraftParticipants: Dispatch<SetStateAction<readonly DraftParticipantDTO[]>>;
  readonly draftAction: ActionState;
  readonly saveDraftAction: ActionState;
  readonly inviteActions: Record<string, ActionState & { readonly invite?: ProductInviteDTO | undefined }>;
  readonly ensureDraft: () => Promise<ProductOrderDraftDTO | undefined>;
  readonly handleCreateDraft: () => Promise<ProductOrderDraftDTO | undefined>;
  readonly handleSaveDraft: () => Promise<void>;
  readonly handleSendInvite: (participant: DraftParticipantDTO) => Promise<void>;
  readonly acceptRequiredParticipants: (walletAddresses: string | readonly string[]) => Promise<ProductWorkbenchE2EAcceptResult>;
} {
  const { api, selectedZhixu } = input;
  const [draft, setDraft] = useState<ProductOrderDraftDTO | undefined>();
  const [draftParticipants, setDraftParticipants] = useState<readonly DraftParticipantDTO[]>([]);
  const [draftAction, setDraftAction] = useState<ActionState>(idleAction);
  const [saveDraftAction, setSaveDraftAction] = useState<ActionState>(idleAction);
  const [inviteActions, setInviteActions] = useState<Record<string, ActionState & { readonly invite?: ProductInviteDTO | undefined }>>({});

  async function ensureDraft(): Promise<ProductOrderDraftDTO | undefined> {
    if (draft) {
      return draft;
    }
    if (!selectedZhixu) {
      setDraftAction({ phase: "error", message: "暂无可创建订单的秩序" });
      return undefined;
    }
    return await handleCreateDraft();
  }

  async function handleCreateDraft(): Promise<ProductOrderDraftDTO | undefined> {
    if (!selectedZhixu) {
      setDraftAction({ phase: "error", message: "暂无可创建订单的秩序" });
      return undefined;
    }
    if (selectedZhixu.reviewStatus !== "approved") {
      setDraftAction({ phase: "error", message: "该秩序当前不可创建新订单" });
      return undefined;
    }
    setDraftAction({ phase: "pending", message: "正在创建订单草稿" });
    try {
      const result = await api.createOrderDraft({
        zhixuId: selectedZhixu.zhixuId,
        title: "A 公司采购 10 台车辆",
        businessType: "车辆",
        totalAmount: "10000",
        currency: "USDC"
      });
      setDraft(result.data);
      setDraftAction({ phase: "success", message: "订单草稿已创建", source: result.source });
      const participantsResult = await api.listParticipants(result.data.draftId);
      setDraftParticipants(participantsResult.data);
      return result.data;
    } catch (error) {
      setDraftAction({ phase: "error", message: readableError(error, "订单草稿创建失败") });
      return undefined;
    }
  }

  async function handleSaveDraft(): Promise<void> {
    const currentDraft = await ensureDraft();
    if (!currentDraft) {
      return;
    }
    setSaveDraftAction({ phase: "pending", message: "正在保存草稿" });
    try {
      const result = await api.updateOrderDraft(currentDraft.draftId, {
        title: currentDraft.title,
        goods: ["Toyota Land Cruiser 300 VX-R"],
        exportRegion: "日本",
        destinationRegion: "阿联酋",
        expectedCompletionDate: "2026-07-31",
        notes: "请按合同约定的分阶段交付计划执行。"
      });
      setDraft(result.data);
      setSaveDraftAction({ phase: "success", message: "草稿已保存", source: result.source });
    } catch (error) {
      setSaveDraftAction({ phase: "error", message: readableError(error, "草稿保存失败") });
    }
  }

  async function handleSendInvite(participant: DraftParticipantDTO): Promise<void> {
    const currentDraft = await ensureDraft();
    if (!currentDraft) {
      return;
    }
    setInviteActions((current) => ({
      ...current,
      [participant.participantId]: { phase: "pending", message: "正在发送邀请" }
    }));
    try {
      const result = await api.createInvite(currentDraft.draftId, {
        participantId: participant.participantId,
        roleSlotId: participant.roleSlotId,
        roleLabel: participant.roleLabel,
        contact: participant.contact || `${participant.roleSlotId}@example.com`,
        displayName: participant.displayName || participant.roleLabel,
        required: participant.required
      });
      const participantsResult = await api.listParticipants(currentDraft.draftId);
      setDraftParticipants(participantsResult.data);
      setInviteActions((current) => ({
        ...current,
        [participant.participantId]: {
          phase: "success",
          message: "邀请已生成，可复制链接发送给对方",
          source: result.source,
          invite: result.data
        }
      }));
    } catch (error) {
      setInviteActions((current) => ({
        ...current,
        [participant.participantId]: { phase: "error", message: readableError(error, "邀请发送失败") }
      }));
    }
  }

  async function acceptRequiredParticipants(walletAddresses: string | readonly string[]): Promise<ProductWorkbenchE2EAcceptResult> {
    const currentDraft = await ensureDraft();
    if (!currentDraft) {
      return { acceptedCount: 0, missingRequired: 0 };
    }

    const wallets = Array.isArray(walletAddresses) ? walletAddresses : [walletAddresses];
    if (wallets.length === 0) {
      throw new Error("product_workbench_e2e_wallets_required");
    }

    const participantsResult = await api.listParticipants(currentDraft.draftId);
    let acceptedCount = 0;
    for (const participant of participantsResult.data) {
      if (!participant.required || participant.status === "accepted") {
        continue;
      }
      const contact = participant.contact || `${participant.roleSlotId}@example.com`;
      const inviteResult = await api.createInvite(currentDraft.draftId, {
        participantId: participant.participantId,
        roleSlotId: participant.roleSlotId,
        roleLabel: participant.roleLabel,
        contact,
        displayName: participant.displayName || participant.roleLabel,
        required: participant.required
      });
      await api.acceptInvite(inviteResult.data.inviteId, {
        displayName: participant.displayName || participant.roleLabel,
        walletAddress: wallets[acceptedCount % wallets.length],
        contact
      });
      acceptedCount += 1;
    }

    const refreshedParticipants = await api.listParticipants(currentDraft.draftId);
    setDraftParticipants(refreshedParticipants.data);
    const refreshedDraft = await api.getOrderDraft(currentDraft.draftId);
    setDraft(refreshedDraft.data);
    const missingRequired = refreshedParticipants.data.filter((participant) =>
      participant.required && participant.status !== "accepted"
    ).length;
    return {
      acceptedCount,
      missingRequired,
      draftId: refreshedDraft.data.draftId,
      draftStatus: refreshedDraft.data.status
    };
  }

  return {
    draft,
    setDraft,
    draftParticipants,
    setDraftParticipants,
    draftAction,
    saveDraftAction,
    inviteActions,
    ensureDraft,
    handleCreateDraft,
    handleSaveDraft,
    handleSendInvite,
    acceptRequiredParticipants
  };
}
