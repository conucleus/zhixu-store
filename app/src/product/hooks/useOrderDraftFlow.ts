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

export interface OrderDraftFormValues {
  readonly title: string;
  readonly businessType: string;
  readonly brandModel: string;
  readonly quantity: string;
  readonly vin: string;
  readonly totalAmount: string;
  readonly currency: string;
  readonly exportRegion: string;
  readonly destinationRegion: string;
  readonly expectedCompletionDate: string;
  readonly notes: string;
}

export const emptyOrderDraftFormValues: OrderDraftFormValues = {
  title: "",
  businessType: "",
  brandModel: "",
  quantity: "",
  vin: "",
  totalAmount: "",
  currency: "",
  exportRegion: "",
  destinationRegion: "",
  expectedCompletionDate: "",
  notes: ""
};

const CREATE_REQUIRED_FIELD_LABELS = ["订单名称", "标的物类型", "品牌型号", "总金额", "币种"] as const;
const SAVE_EXTRA_REQUIRED_FIELD_LABELS = ["出口国家/地区", "目的国家/地区", "预计完成日期"] as const;

export function orderDraftFormValuesFromDraft(draft: ProductOrderDraftDTO): OrderDraftFormValues {
  return {
    title: draft.title,
    businessType: draft.businessType,
    brandModel: draft.goods?.find((item) => item.startsWith("品牌型号："))?.slice("品牌型号：".length) ?? "",
    quantity: draft.goods?.find((item) => item.startsWith("数量："))?.slice("数量：".length) ?? "",
    vin: draft.goods?.find((item) => item.startsWith("VIN："))?.slice("VIN：".length) ?? "",
    totalAmount: draft.totalAmount,
    currency: draft.currency,
    exportRegion: draft.exportRegion ?? "",
    destinationRegion: draft.destinationRegion ?? "",
    expectedCompletionDate: draft.expectedCompletionDate ?? "",
    notes: draft.notes ?? ""
  };
}

function goodsFromValues(values: OrderDraftFormValues): readonly string[] {
  const goods: string[] = [];
  if (values.brandModel.trim()) {
    goods.push(`品牌型号：${values.brandModel.trim()}`);
  }
  if (values.quantity.trim()) {
    goods.push(`数量：${values.quantity.trim()}`);
  }
  if (values.vin.trim()) {
    goods.push(`VIN：${values.vin.trim()}`);
  }
  return goods;
}

function missingRequiredLabels(values: OrderDraftFormValues): readonly string[] {
  const missing: string[] = [];
  if (!values.title.trim()) {
    missing.push("订单名称");
  }
  if (!values.businessType.trim()) {
    missing.push("标的物类型");
  }
  if (!values.brandModel.trim()) {
    missing.push("品牌型号");
  }
  if (!values.totalAmount.trim()) {
    missing.push("总金额");
  }
  if (!values.currency.trim()) {
    missing.push("币种");
  }
  return missing;
}

function missingSaveOnlyLabels(values: OrderDraftFormValues): readonly string[] {
  const missing: string[] = [];
  if (!values.exportRegion.trim()) {
    missing.push("出口国家/地区");
  }
  if (!values.destinationRegion.trim()) {
    missing.push("目的国家/地区");
  }
  if (!values.expectedCompletionDate.trim()) {
    missing.push("预计完成日期");
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
  const [draftAction, setDraftAction] = useState<ActionState>(idleAction);
  const [saveDraftAction, setSaveDraftAction] = useState<ActionState>(idleAction);
  const [inviteActions, setInviteActions] = useState<Record<string, ActionState & { readonly invite?: ProductInviteDTO | undefined }>>({});

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
    if (selectedZhixu.reviewStatus !== "approved") {
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
      const result = await api.createOrderDraft({
        zhixuId: selectedZhixu.zhixuId,
        title: values.title.trim(),
        businessType: values.businessType.trim(),
        totalAmount: values.totalAmount.trim(),
        currency: values.currency.trim()
      });
      setDraft(result.data);
      setDraftAction({ phase: "success", message: "订单草稿已创建", source: result.source });
      const participantsResult = await api.listParticipants(result.data.draftId);
      setDraftParticipants(participantsResult.data);
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
    const missing = [...missingRequiredLabels(values), ...missingSaveOnlyLabels(values)];
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
        exportRegion: values.exportRegion.trim(),
        destinationRegion: values.destinationRegion.trim(),
        expectedCompletionDate: values.expectedCompletionDate.trim(),
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
    draftAction,
    saveDraftAction,
    inviteActions,
    ensureDraft,
    handleCreateDraft,
    handleSaveDraft,
    handleSendInvite
  };
}
