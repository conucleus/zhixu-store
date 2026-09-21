import { useLayoutEffect, useRef, useState } from "react";
import {
  PRODUCT_SUBMIT_DOMAIN_NAME,
  PRODUCT_SUBMIT_DOMAIN_VERSION,
  TRIGGER_ORDER_FROM_OUTSIDE_PRIMARY_TYPE
} from "@uvp-eth/protocol-bindings";
import type { ProductApiClient, ProductOrderDraftDTO } from "../api";
import { isRecord } from "../../lib/frontend";
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
  readableError,
  scopeGenerationValue,
  stateMachineSignExpectation,
  type ScopeGeneration
} from "./workbenchSupport";

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
 * prepare 记录声明的状态机地址与签名域交叉核对（PreparedOrderTriggerDTO.
 * stateMachineAddress 的消费点）：构建期部署配置之外的第二独立来源，两个
 * 预期都指向同一 typedData.domain.verifyingContract 才放行签名——被攻陷
 * 的 BFF 让 prepare 信封自洽也过不了部署配置这一关。
 */
export function assertTriggerDomainMatchesPreparedStateMachine(
  typedData: unknown,
  stateMachineAddress: string
): void {
  const domain = isRecord(typedData) ? typedData.domain : undefined;
  const verifyingContract = isRecord(domain) ? domain.verifyingContract : undefined;
  if (
    typeof verifyingContract !== "string" ||
    verifyingContract.trim().toLowerCase() !== stateMachineAddress.trim().toLowerCase()
  ) {
    throw new Error("签名域与 prepare 记录声明的状态机部署地址不一致，已拒绝签名");
  }
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
    assertTriggerDomainMatchesPreparedStateMachine(prepared.data.typedData, prepared.data.stateMachineAddress);
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
