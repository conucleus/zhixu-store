import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ZhixuDetailDTO } from "@uvp-eth/product-dto";
import type {
  DraftParticipantDTO,
  ProductApiClient,
  ProductInviteDTO,
  ProductOrderDraftDTO
} from "../api";
import { idleAction, type ActionState } from "./workbenchTypes";
import { canCreateProductOrder, readableError } from "./workbenchSupport";

export interface OrderDraftFormValues {
  readonly title: string;
  readonly businessType: string;
  /** Publisher-defined description; Store/Product do not infer a business schema. */
  readonly goodsText: string;
  readonly totalAmount: string;
  readonly currency: string;
  readonly notes: string;
}

export const emptyOrderDraftFormValues: OrderDraftFormValues = {
  title: "",
  businessType: "",
  goodsText: "",
  totalAmount: "",
  currency: "",
  notes: ""
};

const CREATE_REQUIRED_FIELD_LABELS = ["订单名称", "业务类型", "总金额", "币种"] as const;

export function orderDraftFormValuesFromDraft(draft: ProductOrderDraftDTO): OrderDraftFormValues {
  return {
    title: draft.title,
    businessType: draft.businessType,
    goodsText: draft.goods?.join("\n") ?? "",
    totalAmount: draft.totalAmount,
    currency: draft.currency,
    notes: draft.notes ?? ""
  };
}

function goodsFromValues(values: OrderDraftFormValues): readonly string[] {
  return values.goodsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function missingRequiredLabels(values: OrderDraftFormValues): readonly string[] {
  const missing: string[] = [];
  if (!values.title.trim()) {
    missing.push("订单名称");
  }
  if (!values.businessType.trim()) {
    missing.push("业务类型");
  }
  if (!values.totalAmount.trim()) {
    missing.push("总金额");
  }
  if (!values.currency.trim()) {
    missing.push("币种");
  }
  return missing;
}

function requiredFieldError(missingLabels: readonly string[]): ActionState {
  return {
    phase: "error",
    message: `请填写必填字段：${missingLabels.join("、")}`
  };
}

export function useOrderDraftFlow(input: {
  readonly api: ProductApiClient;
  readonly selectedZhixu?: ZhixuDetailDTO | undefined;
  /** 成功 mutation（建草稿/存草稿/发邀请）后触发一次定向刷新；调用方保证只刷一次，钩子内部不循环。 */
  readonly onMutationSuccess?: () => void;
}): {
  readonly draft?: ProductOrderDraftDTO | undefined;
  readonly setDraft: Dispatch<SetStateAction<ProductOrderDraftDTO | undefined>>;
  readonly draftParticipants: readonly DraftParticipantDTO[];
  readonly setDraftParticipants: Dispatch<SetStateAction<readonly DraftParticipantDTO[]>>;
  /** Participant data is an explicit state machine; an empty list is not confirmation. */
  readonly draftParticipantsStatus: "unknown" | "loading" | "ready" | "error";
  readonly draftParticipantsError?: string | undefined;
  readonly draftAction: ActionState;
  readonly saveDraftAction: ActionState;
  readonly inviteActions: Record<string, ActionState & { readonly invite?: ProductInviteDTO | undefined }>;
  readonly ensureDraft: () => Promise<ProductOrderDraftDTO | undefined>;
  readonly handleCreateDraft: (values: OrderDraftFormValues) => Promise<ProductOrderDraftDTO | undefined>;
  readonly handleSaveDraft: (values: OrderDraftFormValues) => Promise<void>;
  readonly handleSendInvite: (participant: DraftParticipantDTO) => Promise<void>;
} {
  const { api, selectedZhixu, onMutationSuccess } = input;
  const [draft, setDraft] = useState<ProductOrderDraftDTO | undefined>();
  const [draftParticipants, setDraftParticipants] = useState<readonly DraftParticipantDTO[]>([]);
  const [draftParticipantsStatus, setDraftParticipantsStatus] = useState<"unknown" | "loading" | "ready" | "error">("unknown");
  const [draftParticipantsError, setDraftParticipantsError] = useState<string | undefined>();
  const [draftAction, setDraftAction] = useState<ActionState>(idleAction);
  const [saveDraftAction, setSaveDraftAction] = useState<ActionState>(idleAction);
  const [inviteActions, setInviteActions] = useState<Record<string, ActionState & { readonly invite?: ProductInviteDTO | undefined }>>({});

  // A catalog switch must not carry a previous order/draft or its participant
  // confirmations into the newly selected frozen DTO.
  useEffect(() => {
    setDraft(undefined);
    setDraftParticipants([]);
    setDraftParticipantsStatus("unknown");
    setDraftParticipantsError(undefined);
    setDraftAction(idleAction);
    setSaveDraftAction(idleAction);
    setInviteActions({});
  }, [selectedZhixu?.zhixuId]);

  async function loadDraftParticipants(draftId: string): Promise<readonly DraftParticipantDTO[]> {
    setDraftParticipantsStatus("loading");
    setDraftParticipantsError(undefined);
    try {
      const result = await api.listParticipants(draftId);
      setDraftParticipants(result.data);
      setDraftParticipantsStatus("ready");
      return result.data;
    } catch (error) {
      const message = readableError(error, "参与方清单加载失败");
      setDraftParticipantsStatus("error");
      setDraftParticipantsError(message);
      throw error;
    }
  }

  async function ensureDraft(): Promise<ProductOrderDraftDTO | undefined> {
    if (draft) {
      return draft;
    }
    setDraftAction({ phase: "error", message: "请先在「订单信息」页填写并创建订单草稿" });
    return undefined;
  }

  async function handleCreateDraft(values: OrderDraftFormValues): Promise<ProductOrderDraftDTO | undefined> {
    if (!selectedZhixu) {
      setDraftAction({ phase: "error", message: "暂无可创建订单的秩序" });
      return undefined;
    }
    if (!canCreateProductOrder(selectedZhixu)) {
      setDraftAction({ phase: "error", message: "该秩序当前不可创建新订单" });
      return undefined;
    }
    const missing = missingRequiredLabels(values);
    if (missing.length > 0) {
      setDraftAction(requiredFieldError(missing));
      return undefined;
    }
    setDraftAction({ phase: "pending", message: "正在创建订单草稿" });
    try {
      const goods = goodsFromValues(values);
      const notes = values.notes.trim();
      const result = await api.createOrderDraft({
        zhixuId: selectedZhixu.zhixuId,
        title: values.title.trim(),
        businessType: values.businessType.trim(),
        ...(goods.length > 0 ? { goods } : {}),
        totalAmount: values.totalAmount.trim(),
        currency: values.currency.trim(),
        ...(notes ? { notes } : {})
      });
      setDraft(result.data);
      setDraftAction({ phase: "success", message: "订单草稿已创建", source: result.source });
      await loadDraftParticipants(result.data.draftId);
      onMutationSuccess?.();
      return result.data;
    } catch (error) {
      setDraftAction({ phase: "error", message: readableError(error, "订单草稿创建失败") });
      return undefined;
    }
  }

  async function handleSaveDraft(values: OrderDraftFormValues): Promise<void> {
    const currentDraft = await ensureDraft();
    if (!currentDraft) {
      return;
    }
    const missing = missingRequiredLabels(values);
    if (missing.length > 0) {
      setSaveDraftAction(requiredFieldError(missing));
      return;
    }
    setSaveDraftAction({ phase: "pending", message: "正在保存草稿" });
    try {
      const result = await api.updateOrderDraft(currentDraft.draftId, {
        title: values.title.trim(),
        businessType: values.businessType.trim(),
        goods: goodsFromValues(values),
        totalAmount: values.totalAmount.trim(),
        currency: values.currency.trim(),
        notes: values.notes.trim()
      });
      setDraft(result.data);
      setSaveDraftAction({ phase: "success", message: "草稿已保存", source: result.source });
      onMutationSuccess?.();
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
      // 不为缺失的联系方式编造占位值：contact 为空就如实传空，
      // 页面会显示"未填写"并提示用其他渠道送达邀请链接。
      const result = await api.createInvite(currentDraft.draftId, {
        participantId: participant.participantId,
        roleSlotId: participant.roleSlotId,
        roleLabel: participant.roleLabel,
        contact: participant.contact.trim(),
        displayName: participant.displayName || participant.roleLabel,
        required: participant.required
      });
      await loadDraftParticipants(currentDraft.draftId);
      setInviteActions((current) => ({
        ...current,
        [participant.participantId]: {
          phase: "success",
          message: participant.contact.trim()
            ? "邀请已生成，可复制链接发送给对方"
            : "邀请已生成；该参与方未填写联系方式，请通过其他渠道把邀请链接送达，并请其补填联系方式",
          source: result.source,
          invite: result.data
        }
      }));
      onMutationSuccess?.();
    } catch (error) {
      setInviteActions((current) => ({
        ...current,
        [participant.participantId]: { phase: "error", message: readableError(error, "邀请发送失败") }
      }));
    }
  }

  return {
    draft,
    setDraft,
    draftParticipants,
    setDraftParticipants,
    draftParticipantsStatus,
    ...(draftParticipantsError ? { draftParticipantsError } : {}),
    draftAction,
    saveDraftAction,
    inviteActions,
    ensureDraft,
    handleCreateDraft,
    handleSaveDraft,
    handleSendInvite
  };
}
