import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ZhixuDetailDTO } from "@uvp-eth/product-dto";
import type {
  DraftParticipantDTO,
  ProductApiClient,
  ProductInviteDTO,
  ProductOrderDraftDTO
} from "../api";
import { idleAction, type ActionState } from "./workbenchTypes";
import {
  advanceScopeGeneration,
  canCreateProductOrder,
  readableError,
  scopeGenerationValue,
  type ScopeGeneration
} from "./workbenchSupport";

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
  /** inviteToken 是一次性明文（只在创建响应出现一次），随动作状态留存供复制链接。 */
  readonly inviteActions: Record<string, ActionState & {
    readonly invite?: ProductInviteDTO | undefined;
    readonly inviteToken?: string | undefined;
  }>;
  readonly ensureDraft: () => Promise<ProductOrderDraftDTO | undefined>;
  readonly handleCreateDraft: (values: OrderDraftFormValues) => Promise<ProductOrderDraftDTO | undefined>;
  readonly handleSaveDraft: (values: OrderDraftFormValues) => Promise<void>;
  readonly handleSendInvite: (participant: DraftParticipantDTO) => Promise<void>;
  /** 参与方清单的手动重试入口（清单加载失败后不重建草稿即可重拉）。 */
  readonly reloadParticipants: () => Promise<void>;
} {
  const { api, selectedZhixu, onMutationSuccess } = input;
  const [draft, setDraft] = useState<ProductOrderDraftDTO | undefined>();
  const [draftParticipants, setDraftParticipants] = useState<readonly DraftParticipantDTO[]>([]);
  const [draftParticipantsStatus, setDraftParticipantsStatus] = useState<"unknown" | "loading" | "ready" | "error">("unknown");
  const [draftParticipantsError, setDraftParticipantsError] = useState<string | undefined>();
  const [draftAction, setDraftAction] = useState<ActionState>(idleAction);
  const [saveDraftAction, setSaveDraftAction] = useState<ActionState>(idleAction);
  const [inviteActions, setInviteActions] = useState<Record<string, ActionState & {
    readonly invite?: ProductInviteDTO | undefined;
    readonly inviteToken?: string | undefined;
  }>>({});

  // 目录作用域键在 A→B→A 回切时会复用：按裸键比较的 stale 检查在回切后
  // "键又对上了"，旧目录的在途请求（建草稿/存草稿/发邀请）会把旧结果写进
  // 当前界面。代数单调递增且从不复用，键变化即推进；同键重渲染保持不变。
  const scopeKey = selectedZhixu?.zhixuId;
  const generationRef = useRef<ScopeGeneration<string | undefined>>({ key: scopeKey, generation: 1 });
  generationRef.current = advanceScopeGeneration(generationRef.current, scopeKey);
  const effectiveScopeKey = scopeGenerationValue(generationRef.current);
  const scopeRef = useRef(effectiveScopeKey);

  // A catalog switch (including re-entering a previously left catalog) must not
  // carry a previous order/draft or its participant confirmations into the
  // newly selected frozen DTO.
  useLayoutEffect(() => {
    scopeRef.current = effectiveScopeKey;
    setDraft(undefined);
    setDraftParticipants([]);
    setDraftParticipantsStatus("unknown");
    setDraftParticipantsError(undefined);
    setDraftAction(idleAction);
    setSaveDraftAction(idleAction);
    setInviteActions({});
  }, [effectiveScopeKey]);

  async function loadDraftParticipants(draftId: string): Promise<readonly DraftParticipantDTO[]> {
    const requestScope = scopeRef.current;
    setDraftParticipantsStatus("loading");
    setDraftParticipantsError(undefined);
    try {
      const result = await api.listParticipants(draftId);
      if (scopeRef.current !== requestScope) {
        return result.data;
      }
      setDraftParticipants(result.data);
      setDraftParticipantsStatus("ready");
      return result.data;
    } catch (error) {
      if (scopeRef.current !== requestScope) {
        throw error;
      }
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
    const requestScope = scopeRef.current;
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
      if (scopeRef.current !== requestScope) {
        return undefined;
      }
      setDraft(result.data);
      setDraftAction({ phase: "success", message: "订单草稿已创建", source: result.source });
      try {
        await loadDraftParticipants(result.data.draftId);
      } catch (listError) {
        if (scopeRef.current !== requestScope) {
          return undefined;
        }
        // 草稿已创建是既成事实：清单加载失败不得回滚为"创建失败"定性。
        setDraftAction({
          phase: "success",
          message: `订单草稿已创建；参与方清单加载失败（${readableError(listError, "请稍后重试")}），可在参与方页重试加载`,
          source: result.source
        });
        return result.data;
      }
      if (scopeRef.current !== requestScope) {
        return undefined;
      }
      onMutationSuccess?.();
      return result.data;
    } catch (error) {
      if (scopeRef.current !== requestScope) {
        return undefined;
      }
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
    const requestScope = scopeRef.current;
    try {
      const result = await api.updateOrderDraft(currentDraft.draftId, {
        title: values.title.trim(),
        businessType: values.businessType.trim(),
        goods: goodsFromValues(values),
        totalAmount: values.totalAmount.trim(),
        currency: values.currency.trim(),
        notes: values.notes.trim()
      });
      if (scopeRef.current !== requestScope) {
        return;
      }
      setDraft(result.data);
      setSaveDraftAction({ phase: "success", message: "草稿已保存", source: result.source });
      onMutationSuccess?.();
    } catch (error) {
      if (scopeRef.current !== requestScope) {
        return;
      }
      setSaveDraftAction({ phase: "error", message: readableError(error, "草稿保存失败") });
    }
  }

  async function handleSendInvite(participant: DraftParticipantDTO): Promise<void> {
    // 服务端对 contact 必填（空值 400）：前端同一口径先拦并给出可操作提示，
    // 不再发出注定失败的请求，也不为缺失联系方式编造占位值。
    if (!participant.contact.trim()) {
      setInviteActions((current) => ({
        ...current,
        [participant.participantId]: {
          phase: "error",
          message: "该参与方未填写联系方式：请先补填联系方式再发送邀请"
        }
      }));
      return;
    }
    const currentDraft = await ensureDraft();
    if (!currentDraft) {
      return;
    }
    setInviteActions((current) => ({
      ...current,
      [participant.participantId]: { phase: "pending", message: "正在发送邀请" }
    }));
    const requestScope = scopeRef.current;
    try {
      const result = await api.createInvite(currentDraft.draftId, {
        participantId: participant.participantId,
        roleSlotId: participant.roleSlotId,
        roleLabel: participant.roleLabel,
        contact: participant.contact.trim(),
        displayName: participant.displayName || participant.roleLabel,
        required: participant.required
      });
      if (scopeRef.current !== requestScope) {
        return;
      }
      // 一次性明文 token 只在本响应出现：先把成功态与 token 落进动作状态
      // （复制链接出口就绪），清单刷新失败也不得回滚为失败定性——回滚会把
      // token 一起丢掉，用户只能重发一份新邀请。
      const inviteSuccess: ActionState & {
        readonly invite?: ProductInviteDTO | undefined;
        readonly inviteToken?: string | undefined;
      } = {
        phase: "success",
        message: "邀请已生成，可复制邀请链接发送给对方",
        source: result.source,
        invite: result.data.invite,
        inviteToken: result.data.inviteToken
      };
      setInviteActions((current) => ({
        ...current,
        [participant.participantId]: inviteSuccess
      }));
      try {
        await loadDraftParticipants(currentDraft.draftId);
      } catch (listError) {
        if (scopeRef.current !== requestScope) {
          return;
        }
        setInviteActions((current) => ({
          ...current,
          [participant.participantId]: {
            ...inviteSuccess,
            message: `邀请已生成，可复制邀请链接发送给对方；参与方清单刷新失败（${readableError(listError, "请稍后重试")}），清单状态未同步`
          }
        }));
        return;
      }
      if (scopeRef.current !== requestScope) {
        return;
      }
      onMutationSuccess?.();
    } catch (error) {
      if (scopeRef.current !== requestScope) {
        return;
      }
      setInviteActions((current) => ({
        ...current,
        [participant.participantId]: { phase: "error", message: readableError(error, "邀请发送失败") }
      }));
    }
  }

  async function reloadParticipants(): Promise<void> {
    if (!draft) {
      return;
    }
    try {
      await loadDraftParticipants(draft.draftId);
    } catch {
      // 失败态已由 loadDraftParticipants 落进 draftParticipantsStatus/Error。
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
    handleSendInvite,
    reloadParticipants
  };
}
