import { useLayoutEffect, useRef, useState } from "react";
import {
  PRODUCT_SUBMIT_DOMAIN_NAME,
  PRODUCT_SUBMIT_DOMAIN_VERSION,
  TRIGGER_ORDER_FROM_OUTSIDE_PRIMARY_TYPE
} from "@uvp-eth/protocol-bindings";
import type { ProductApiClient, ProductOrderDraftDTO } from "../api";
import {
  requestWalletAccount,
  signTypedData,
  WalletNotConnectedError,
  WalletRejectedError,
  type SignTypedDataExpectation,
  type WalletAccount
} from "../wallet";
import { idleAction, type ActionState } from "./workbenchTypes";
import {
  advanceScopeGeneration,
  assertTypedDataDomainMatchesStateMachineAddress,
  readableError,
  scopeGenerationValue,
  stateMachineSignExpectation,
  type ScopeGeneration
} from "./workbenchSupport";

/** draft.status 的产品侧文案（拒绝门消息用，与服务端状态词同源）。 */
const DRAFT_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "草稿中",
  awaiting_participants: "等待参与方确认",
  ready_to_trigger: "可启动",
  triggering: "启动广播中",
  triggered: "已启动",
  failed: "启动失败",
  cancelled: "已取消"
};

/**
 * re-prepare 门（「重试=同身份重放」前端腿，UB-3）：只有 failed（服务端
 * 同身份重开闸放行的形态，重试会复用同一 prepareId/链上订单身份）与
 * ready_to_trigger（首次/幂等 prepare）才发起 prepare-trigger 调用。
 * 终态（triggered/cancelled）与在途（triggering）稿不再出现 re-prepare
 * 调用——重复调用在服务端只会 409，客户端先挡一次，避免把"重试"误解
 * 为再生意份的入口。
 */
export function canPrepareOrderTrigger(status: string): boolean {
  return status === "ready_to_trigger" || status === "failed";
}

/** 订单启动流的可注入原语：默认接浏览器钱包，测试注入桩。 */
export interface OrderRegistrationDeps {
  readonly api: ProductApiClient;
  readonly ensureDraft: () => Promise<ProductOrderDraftDTO | undefined>;
  readonly onRegistered: (draft: ProductOrderDraftDTO) => void;
  readonly setAction: (action: ActionState) => void;
  /** 请求发起后目录/草稿作用域已切换时为 true：续作与回调都必须丢弃。 */
  readonly isStale: () => boolean;
  readonly requestAccount: () => Promise<WalletAccount>;
  readonly sign: (account: WalletAccount, typedData: unknown, expectation: SignTypedDataExpectation) => Promise<string>;
  /** 签名域预期值来源（部署配置注入）；测试注入桩，缺省 fail-closed。 */
  readonly signExpectation?: () => { readonly verifyingContract: string };
}

/**
 * 订单启动核心链路（prepare→签名→trigger），独立于 React 以便测试。
 * 每一步 await 之后都做作用域检查：切换目录会清空草稿，旧草稿的启动
 * 结果不得写进新选中 DTO 的界面（onRegistered 会被跳过）。
 */
export async function executeOrderRegistration(deps: OrderRegistrationDeps): Promise<void> {
  const currentDraft = await deps.ensureDraft();
  if (!currentDraft) {
    return;
  }
  // re-prepare 门（UB-3 前端腿）：终态/在途稿不发起 prepare-trigger。
  // failed 稿是唯一的重试形态（服务端按同身份重开复用既有
  // prepareId/链上订单身份），其余状态先响亮拒绝，不出网络调用。
  if (!canPrepareOrderTrigger(currentDraft.status)) {
    deps.setAction({
      phase: "error",
      message: `当前订单${DRAFT_STATUS_LABELS[currentDraft.status] ?? `状态 ${currentDraft.status}`}不可重新启动，请刷新订单状态后再操作`
    });
    return;
  }
  try {
    deps.setAction({ phase: "pending", message: "正在准备订单启动签名" });
    const account = await deps.requestAccount();
    if (deps.isStale()) {
      return;
    }
    const prepared = await deps.api.prepareOrderTrigger(currentDraft.draftId, { walletAddress: account.address });
    if (deps.isStale()) {
      return;
    }
    deps.setAction({ phase: "pending", message: "等待钱包授权", source: prepared.source });
    // prepare 记录声明的部署地址先与签名域核对（api 层已 fail-closed 保证
    // 地址必填）：与下方构建期注入的预期构成双重核对，任一不符即拒签。
    assertTypedDataDomainMatchesStateMachineAddress(prepared.data.typedData, prepared.data.stateMachineAddress, "prepare 记录");
    // 与 executor-kit 同边界：签名前校验启动签名对象的 primaryType、domain 和 submitter；
    // verifyingContract 预期来自部署配置注入（独立来源，不读同一 prepare
    // 响应里的地址），缺配置即拒绝签名，防被攻陷 BFF 换域让钱包照签。
    const signature = await deps.sign(account, prepared.data.typedData, {
      primaryType: TRIGGER_ORDER_FROM_OUTSIDE_PRIMARY_TYPE,
      domainName: PRODUCT_SUBMIT_DOMAIN_NAME,
      // 协议冻结面：domain.version 以 protocol-bindings 导出的常量为唯一来源。
      domainVersion: PRODUCT_SUBMIT_DOMAIN_VERSION,
      verifyingContract: (deps.signExpectation ?? stateMachineSignExpectation)().verifyingContract,
      submitter: account.address,
      preparedSubmitters: [prepared.data.submitter]
    });
    if (deps.isStale()) {
      return;
    }
    const result = await deps.api.triggerOrder(currentDraft.draftId, {
      prepareId: prepared.data.prepareId,
      signature,
      walletAddress: account.address
    });
    if (deps.isStale()) {
      return;
    }
    deps.setAction({ phase: "success", message: "订单已启动，正在等待订单页同步", source: result.source });
    deps.onRegistered(result.data);
  } catch (error) {
    if (deps.isStale()) {
      return;
    }
    if (error instanceof WalletNotConnectedError) {
      deps.setAction({ phase: "error", message: "请连接浏览器钱包后再启动订单" });
      return;
    }
    if (error instanceof WalletRejectedError) {
      deps.setAction({ phase: "error", message: "你取消了签名，可以重新启动" });
      return;
    }
    deps.setAction({ phase: "error", message: readableError(error, "订单启动失败") });
  }
}

export function useOrderRegistrationFlow(input: {
  readonly api: ProductApiClient;
  /** 当前选中秩序（目录）的作用域键：切换目录即在途启动请求全部作废。 */
  readonly scopeKey?: string | undefined;
  readonly ensureDraft: () => Promise<ProductOrderDraftDTO | undefined>;
  readonly onRegistered: (draft: ProductOrderDraftDTO) => void;
}): {
  readonly registerDraftAction: ActionState;
  readonly handleRegisterDraft: () => Promise<void>;
} {
  const { api, scopeKey, ensureDraft, onRegistered } = input;
  const [registerDraftAction, setRegisterDraftAction] = useState<ActionState>(idleAction);
  // 作用域键在 A→B→A 回切时会复用：按裸键比较的 stale 检查在回切后
  // "键又对上了"，旧目录的在途启动链路（prepare→签名→trigger）继续广播
  // 并把旧结果写回当前界面。代数单调递增且不复用，键变化即推进；同键
  // 重渲染（投影刷新）保持不变。
  const generationRef = useRef<ScopeGeneration<string | undefined>>({ key: scopeKey, generation: 1 });
  generationRef.current = advanceScopeGeneration(generationRef.current, scopeKey);
  const effectiveScopeKey = scopeGenerationValue(generationRef.current);
  const scopeRef = useRef(effectiveScopeKey);
  // 同步互斥（useTaskSubmissionFlow submitInflightRef 同款）：启动是
  // prepare→签名→trigger 的长链路，按钮 pending 禁用要等重渲染才生效，
  // 同步 ref 挡住重渲染前的第二次点击（服务端幂等只是兜底）。
  const registerInflightRef = useRef(false);

  useLayoutEffect(() => {
    scopeRef.current = effectiveScopeKey;
    // 上一目录的启动结果/错误不得带进新选中的 DTO。
    setRegisterDraftAction(idleAction);
  }, [effectiveScopeKey]);

  async function handleRegisterDraft(): Promise<void> {
    if (registerInflightRef.current) {
      return;
    }
    registerInflightRef.current = true;
    const requestScope = scopeRef.current;
    try {
      await executeOrderRegistration({
        api,
        ensureDraft,
        onRegistered,
        setAction: setRegisterDraftAction,
        isStale: () => scopeRef.current !== requestScope,
        requestAccount: requestWalletAccount,
        sign: signTypedData
      });
    } finally {
      registerInflightRef.current = false;
    }
  }

  return { registerDraftAction, handleRegisterDraft };
}
