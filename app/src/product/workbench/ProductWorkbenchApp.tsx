// 参与者侧订单工作台编排入口：视图状态、流程接线（既有 flow hooks）与加载/诊断/登录态分流。
// 各视图渲染已按功能迁至 order/tasks/evidence/signing 与本目录 ZhixuCatalogViews（纯搬迁，
// 组件逻辑、hook 调用、状态更新与原 ProductWorkbenchApp.tsx 一字未改）。
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createProductApiClient, type ProductWorkbenchData } from "../api";
import { WalletLoginPanel } from "../WalletLoginPanel";
import { createStoreApiClient, storeStoreSessionToken } from "../../store/api";
import { loginStoreSessionWithWallet } from "../../store/session";
import { hasStoreWallet } from "../../store/wallet";
import { emptyOrderDraftFormValues, useOrderDraftFlow, type OrderDraftFormValues } from "./useOrderDraftFlow";
import { useOrderRegistrationFlow } from "./useOrderRegistrationFlow";
import { useProductWorkbenchData } from "./useProductWorkbenchData";
import { useTaskSubmissionFlow } from "./useTaskSubmissionFlow";
import type { ProductView } from "./workbenchTypes";
import {
  canSubmitWorkbenchTask,
  delay,
  emptyTaskEvidenceFieldValues,
  missingTaskEvidenceSlotLabels,
  resolveWorkbenchTask,
  type TaskEvidenceFieldValues
} from "./workbenchSupport";
import { EmptyCatalogPage, RuntimeBanner, TopNav } from "./WorkbenchShell";
import { EmptyState, StatePanel, StatusBadge } from "./WorkbenchWidgets";
import { CatalogPage, ParticipantAppPage, ZhixuDetailPage } from "./ZhixuCatalogViews";
import { CreateOrderPage } from "../order/CreateOrderPage";
import { OrderOverviewPage } from "../order/OrderOverviewPage";
import { ParticipantsPage } from "../signing/ParticipantsPage";
import { TaskPage } from "../tasks/TaskPage";
import { SubmitPage } from "../tasks/SubmitPage";
import { DisputePage } from "../tasks/DisputePage";

export function ProductWorkbenchApp() {
  const api = useMemo(() => createProductApiClient(), []);
  // reload：诊断页手动重试（整页回到加载态）；refresh：mutation 成功后的定向刷新（原地更新，失败保留现数据）。
  const { loadState, reload: reloadWorkbench, refresh: refreshWorkbench } = useProductWorkbenchData(api);
  const [view, setView] = useState<ProductView>("app");
  const [proofOpen, setProofOpen] = useState(false);
  // 每张待办卡片携带自己的 taskId：这里记录选中的任务，未选中时回退到投影的 activeTask。
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);
  // 目录里多个秩序时记录选中的秩序：未选中时回退到投影的 activeTask。
  // 参与者面不再只渲染第一条秩序（RC-H：多秩序目录只有第一条可达）。
  const [selectedZhixuId, setSelectedZhixuId] = useState<string | undefined>(undefined);
  // 订单信息与待办凭证表单状态提升到本组件：视图切换会卸载页面组件，
  // 未保存的用户输入不能因为切换视图被静默清空。
  const [draftFormValues, setDraftFormValues] = useState<OrderDraftFormValues>(emptyOrderDraftFormValues);
  const [taskEvidenceFields, setTaskEvidenceFields] = useState<TaskEvidenceFieldValues>(emptyTaskEvidenceFieldValues);

  /** 打开指定任务详情；不传 taskId 时沿用当前选中任务或投影 activeTask。 */
  function openTask(taskId?: string): void {
    setSelectedTaskId(taskId);
    setView("task");
  }

  const activeNav = useMemo(() => {
    if (view === "app") {
      return "订单工作台";
    }
    if (view === "home" || view === "zhixu" || view === "create" || view === "participants" || view === "submit" || view === "dispute") {
      return "订单工作台";
    }
    if (view === "task") {
      return "待办";
    }
    return "订单";
  }, [view]);

  const data = loadState.status === "ready" || loadState.status === "empty" ? loadState.data : undefined;
  const selectedZhixu = data?.zhixus.find((zhixu) => zhixu.zhixuId === selectedZhixuId) ?? data?.zhixu;
  const selectedOrder = data?.order;
  const activeTask = resolveWorkbenchTask(data?.tasks ?? [], selectedTaskId, data?.activeTask);
  const taskScopeKey = activeTask?.taskId ?? "none";
  useLayoutEffect(() => {
    // Evidence and field values belong to one task. Clearing the scope on an
    // identity change prevents a previous task's evidence IDs from being
    // submitted with the next task.
    setTaskEvidenceFields(emptyTaskEvidenceFieldValues);
  }, [taskScopeKey]);
  const draftFlow = useOrderDraftFlow({ api, selectedZhixu, onMutationSuccess: refreshWorkbench });
  const {
    draft,
    draftParticipants,
    draftAction,
    saveDraftAction,
    inviteActions,
    ensureDraft,
    handleCreateDraft,
    handleSaveDraft,
    handleSendInvite,
    reloadParticipants
  } = draftFlow;
  // 订单启动后的"同步中"只做过渡桥：等订单投影落地（有界轮询）再跳转/清标志，
  // 绝不永久挂起；索引迟迟未落地时保持"同步中"中间态，不把空订单页当"启动失败"
  // 诱导重复触发。
  const [awaitingOrderSync, setAwaitingOrderSync] = useState(false);
  const awaitedOrderIdRef = useRef<string | undefined>(undefined);

  function triggeredOrderProjected(loaded: ProductWorkbenchData | undefined): boolean {
    const orderId = awaitedOrderIdRef.current;
    if (!loaded) {
      return false;
    }
    if (orderId) {
      return loaded.orders.some((order) => order.orderId === orderId);
    }
    return loaded.order !== undefined;
  }

  async function waitForOrderProjection(): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt > 0) {
        await delay(1200);
      }
      if (triggeredOrderProjected(await refreshWorkbench())) {
        return true;
      }
    }
    return false;
  }

  const { registerDraftAction, handleRegisterDraft } = useOrderRegistrationFlow({
    api,
    // 目录作用域：切换目录后，在途的订单启动续作与回调全部作废。
    scopeKey: selectedZhixu?.zhixuId,
    ensureDraft,
    onRegistered: (nextDraft) => {
      draftFlow.setDraft(nextDraft);
      awaitedOrderIdRef.current = nextDraft.triggeredOrderId;
      setAwaitingOrderSync(true);
      void waitForOrderProjection().then((projected) => {
        setView("order");
        if (projected) {
          setAwaitingOrderSync(false);
        }
        // 窗口耗尽仍未落地：保持"同步中"过渡态，由后续刷新观察到订单时再复位。
      });
    }
  });
  const {
    evidencePlan,
    evidenceBySlot,
    evidenceProofsBySlot,
    staleSlotLabels,
    unverifiedSlotLabels,
    evidenceAction,
    uploadingSlotKeys,
    submitMachine,
    disputeAction,
    handleUploadEvidence,
    handleConfirmSubmit,
    handleDisputeSave
  } = useTaskSubmissionFlow({ api, activeTask, fieldValues: taskEvidenceFields, onMutationSuccess: refreshWorkbench });
  // 轮询窗口耗尽后，任何一次后续投影刷新观察到订单即复位"同步中"过渡桥。
  useEffect(() => {
    if (awaitingOrderSync && triggeredOrderProjected(data)) {
      setAwaitingOrderSync(false);
    }
  }, [awaitingOrderSync, data]);
  // 新订单投影滞后时页面可能仍在展示旧订单：旧订单本身不是"同步中"，
  // 两个状态必须区分开——"同步中"只描述投影追赶，等待新订单落地用独立提示。
  const awaitingNewOrderProjection = Boolean(
    awaitingOrderSync &&
    awaitedOrderIdRef.current &&
    selectedOrder &&
    selectedOrder.orderId !== awaitedOrderIdRef.current
  );
  const firstEvidence = Object.values(evidenceBySlot)[0];
  // 提交门槛：必填证据槽位全部满足（文件已上传或该任务没有文件要求）即可提交；
  // 纯 text/date 或无槽位任务允许零上传的纯字段确认提交。
  const missingEvidenceSlotLabels = missingTaskEvidenceSlotLabels(
    evidencePlan.slots,
    taskEvidenceFields,
    Object.keys(evidenceBySlot)
  );
  // 上传后相关字段变更的槽位（指纹已分叉）、核验异常的隔离凭证与未取到
  // 核验记录的凭证一样禁锁提交。
  const verificationFailedLabels = Object.entries(evidenceProofsBySlot)
    .filter(([, proof]) => proof.verificationStatus === "mismatch" || proof.verificationStatus === "missing_file")
    .map(([key]) => evidencePlan.slots.find((slot) => slot.key === key)?.label ?? key);
  // 服务端权威门 + 本次会话终态闸：status/canSubmit 不满足或已 confirmed
  // 的任务不呈现可提交入口（order-app 同功能面 fail-closed）。
  const taskSubmitGate = activeTask ? canSubmitWorkbenchTask(activeTask, submitMachine.status) : false;
  const canConfirmSubmit = taskSubmitGate &&
    missingEvidenceSlotLabels.length === 0 &&
    staleSlotLabels.length === 0 &&
    verificationFailedLabels.length === 0 &&
    unverifiedSlotLabels.length === 0;

  async function handleNextParticipants(): Promise<void> {
    const currentDraft = await ensureDraft();
    if (currentDraft) {
      setView("participants");
    }
  }

  async function handleWalletLogin(): Promise<void> {
    // 与 Store 入口同一身份通道：挑战-签名-verify 换会话 token，落进
    // localStorage（product client 每次请求现读该 token，登录后立即生效）。
    const result = await loginStoreSessionWithWallet(createStoreApiClient());
    storeStoreSessionToken({ token: result.verify.token, expiresAt: result.verify.session.expiresAt });
    await reloadWorkbench();
  }

  const workbenchState = {
    mode: import.meta.env.MODE,
    view,
    sourceKind: data?.source.kind ?? null,
    apiBaseUrl: data?.source.baseUrl ?? null,
    syncState: data?.syncState ?? null,
    zhixuId: selectedZhixu?.zhixuId ?? null,
    draftId: draft?.draftId ?? null,
    orderId: draft?.triggeredOrderId ?? selectedOrder?.orderId ?? null,
    taskId: activeTask?.taskId ?? null,
    evidenceId: firstEvidence?.evidenceId ?? null,
    submissionId: submitMachine.submission?.submissionId ?? null,
    triggerTxHash: draft?.triggerTxHash ?? null,
    signalTxHash: submitMachine.submission?.txHash ?? firstEvidence?.boundSignalTxHash ?? null
  };

  if (loadState.status === "loading") {
    const loadingSource = api.baseUrl ? "real" : "unconfigured";
    return (
      <div
        className="product-app"
        data-testid="product-workbench"
        data-uvp-api-base-url={api.baseUrl ?? ""}
        data-uvp-mode={import.meta.env.MODE}
        data-uvp-source={loadingSource}
      >
        <TopNav active={activeNav} onGo={setView} />
        <main className="product-main">
          <section className="page-shell">
            <StatePanel icon={<Loader2 className="spin" />} title="正在加载订单工作台" desc="正在读取订单、待办和审核状态。" />
          </section>
        </main>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="product-app">
        <TopNav active={activeNav} onGo={setView} />
        <main className="product-main">
          <section className="page-shell">
            <StatePanel icon={<AlertTriangle />} title="订单工作台加载失败" desc={loadState.message} tone="error" />
          </section>
        </main>
      </div>
    );
  }

  if (loadState.status === "unauthenticated") {
    // 非 local 部署的无会话态：登录是唯一可用入口，不渲染待办工作区
    // （渲染了也只是一整屏 401 派生错误）。
    return (
      <div className="product-app" data-testid="product-workbench" data-uvp-mode={import.meta.env.MODE}>
        <TopNav active={activeNav} onGo={setView} />
        <main className="product-main">
          <section className="page-shell">
            <WalletLoginPanel hasWallet={hasStoreWallet()} onLogin={handleWalletLogin} />
          </section>
        </main>
      </div>
    );
  }

  if (loadState.status === "diagnostic") {
    return (
      <div
        className="product-app"
        data-testid="product-workbench"
        data-uvp-source={loadState.source.kind}
        data-uvp-api-base-url={loadState.source.kind === "real" ? loadState.source.baseUrl : ""}
        data-uvp-mode={import.meta.env.MODE}
      >
        <TopNav active={activeNav} onGo={setView} />
        <main className="product-main">
          <RuntimeBanner syncing={false} />
          <section className="page-shell" data-testid="workbench-diagnostic-panel">
            <div className="state-panel error">
              <span><AlertTriangle /></span>
              <div>
                <h2>订单工作台无法加载</h2>
                <p>部分后端接口返回异常，以下是各接口状态。</p>
              </div>
            </div>
            <div className="panel-card" data-testid="workbench-diagnostic-table">
              <div className="panel-heading">
                <h2>接口诊断</h2>
              </div>
              <div className="diagnostic-grid">
                <div className="diagnostic-head">
                  <span>接口</span>
                  <span>状态码</span>
                  <span>错误码</span>
                  <span>说明</span>
                </div>
                {loadState.diagnostics.map((diag) => (
                  <div
                    className="diagnostic-row"
                    data-testid={`workbench-diagnostic-${diagEndpointKey(diag.endpoint)}`}
                    data-diagnostic-status={diag.status}
                    data-diagnostic-error-code={diag.errorCode ?? ""}
                    key={diag.endpoint}
                  >
                    <span className="diagnostic-endpoint">{diag.endpoint}</span>
                    <StatusBadge tone={diag.status >= 500 ? "warning" : "info"}>{String(diag.status)}</StatusBadge>
                    <span className="diagnostic-error-code">{diag.errorCode ?? "-"}</span>
                    <span className="diagnostic-message">{diag.message}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="button-row centered" style={{ marginTop: "1rem" }}>
              <button
                className="primary-button"
                data-testid="workbench-diagnostic-retry-button"
                onClick={() => {
                  void reloadWorkbench();
                }}
              >
                <RefreshCw /> 重新加载
              </button>
            </div>
            <p className="center-note" style={{ marginTop: "0.5rem" }}>
              如持续失败，请确认后端服务运行正常且认证配置无误，然后刷新页面重试。
            </p>
          </section>
        </main>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div
      className="product-app"
      data-testid="product-workbench"
      data-uvp-api-base-url={workbenchState.apiBaseUrl ?? ""}
      data-uvp-draft-id={workbenchState.draftId ?? ""}
      data-uvp-evidence-id={workbenchState.evidenceId ?? ""}
      data-uvp-mode={workbenchState.mode}
      data-uvp-order-id={workbenchState.orderId ?? ""}
      data-uvp-trigger-tx-hash={workbenchState.triggerTxHash ?? ""}
      data-uvp-signal-tx-hash={workbenchState.signalTxHash ?? ""}
      data-uvp-source={workbenchState.sourceKind ?? ""}
      data-uvp-submission-id={workbenchState.submissionId ?? ""}
      data-uvp-sync-state={workbenchState.syncState ?? ""}
      data-uvp-task-id={workbenchState.taskId ?? ""}
      data-uvp-view={workbenchState.view}
      data-uvp-zhixu-id={workbenchState.zhixuId ?? ""}
    >
      <TopNav active={activeNav} onGo={setView} participantName={data?.participant?.displayName} openTaskCount={data ? data.tasks.filter((task) => task.status === "open").length : undefined} />
      <main className="product-main">
        <RuntimeBanner syncing={data.syncState === "syncing"} degradedCount={data.diagnostics.length} />
        {loadState.status === "empty" ? <EmptyCatalogPage /> : null}
        {loadState.status === "ready" && view === "app" ? <ParticipantAppPage data={data} selectedZhixuId={selectedZhixu?.zhixuId} onSelectZhixu={setSelectedZhixuId} onCatalog={() => setView("home")} onViewDetail={() => setView("zhixu")} onCreate={() => setView("create")} onOrder={() => setView("order")} onTask={(taskId) => openTask(taskId)} /> : null}
        {loadState.status === "ready" && view === "home" && selectedZhixu ? <CatalogPage zhixu={selectedZhixu} zhixus={data.zhixus} onSelectZhixu={setSelectedZhixuId} order={selectedOrder} task={activeTask} onViewDetail={() => setView("zhixu")} onCreate={() => setView("create")} onOrder={() => setView("order")} onTask={(taskId) => openTask(taskId)} /> : null}
        {loadState.status === "ready" && view === "zhixu" && selectedZhixu ? <ZhixuDetailPage zhixu={selectedZhixu} onBack={() => setView("home")} onCreate={() => setView("create")} proofOpen={proofOpen} setProofOpen={setProofOpen} /> : null}
        {loadState.status === "ready" && view === "create" && selectedZhixu ? <CreateOrderPage zhixu={selectedZhixu} draft={draft} createAction={draftAction} saveAction={saveDraftAction} values={draftFormValues} onValuesChange={(patch) => setDraftFormValues((current) => ({ ...current, ...patch }))} onBack={() => setView("zhixu")} onCreate={(values) => void handleCreateDraft(values)} onSave={(values) => void handleSaveDraft(values)} onNext={handleNextParticipants} /> : null}
        {loadState.status === "ready" && view === "participants" ? <ParticipantsPage order={selectedOrder} draft={draft} draftParticipants={draftParticipants} draftParticipantsStatus={draftFlow.draftParticipantsStatus} draftParticipantsError={draftFlow.draftParticipantsError} inviteActions={inviteActions} registerAction={registerDraftAction} onBack={() => setView("create")} onInvite={handleSendInvite} onRegister={handleRegisterDraft} onOrder={() => setView("order")} onReloadParticipants={() => void reloadParticipants()} /> : null}
        {loadState.status === "ready" && view === "order" ? selectedOrder ? <OrderOverviewPage order={selectedOrder} syncing={data.syncState === "syncing"} awaitingNewOrderProjection={awaitingNewOrderProjection} onBack={() => setView("home")} onTask={() => setView("task")} onDispute={() => setView("dispute")} proofOpen={proofOpen} setProofOpen={setProofOpen} /> : awaitingOrderSync ? (
          <section className="page-shell">
            <StatePanel icon={<RefreshCw className="spin" />} title="订单状态同步中" desc="订单已启动，正在等待链上投影同步；请勿重复启动，稍后刷新即可查看订单总览。" tone="info" />
          </section>
        ) : <EmptyState title="暂无进行中订单" desc="创建并启动订单后，这里会展示订单总览、当前待办和最近事件。" /> : null}
        {loadState.status === "ready" && view === "task" ? activeTask ? <TaskPage task={activeTask} evidencePlan={evidencePlan} evidenceBySlot={evidenceBySlot} evidenceProofsBySlot={evidenceProofsBySlot} uploadAction={evidenceAction} uploadingSlotKeys={uploadingSlotKeys} canConfirm={canConfirmSubmit} missingEvidenceLabels={missingEvidenceSlotLabels} staleSlotLabels={staleSlotLabels} unverifiedEvidenceLabels={unverifiedSlotLabels} verificationFailedLabels={verificationFailedLabels} fieldValues={taskEvidenceFields} onFieldValuesChange={(patch) => setTaskEvidenceFields((current) => ({ ...current, ...patch }))} onBack={() => setView("order")} onUpload={(slotKey, file) => void handleUploadEvidence(slotKey, file)} onSubmit={() => setView("submit")} onDispute={() => setView("dispute")} /> : <EmptyState title="暂无待办" desc="当前没有需要你处理的任务。" /> : null}
        {loadState.status === "ready" && view === "submit" ? activeTask ? <SubmitPage task={activeTask} evidencePlan={evidencePlan} evidenceBySlot={evidenceBySlot} submitMachine={submitMachine} canSubmit={canConfirmSubmit} staleSlotLabels={staleSlotLabels} unverifiedEvidenceLabels={unverifiedSlotLabels} verificationFailedLabels={verificationFailedLabels} onBack={() => setView("task")} onSubmit={() => void handleConfirmSubmit()} onOrder={() => setView("order")} /> : <EmptyState title="暂无可提交的待办" desc="待办完成凭证上传后，可在这里确认提交。" /> : null}
        {loadState.status === "ready" && view === "dispute" ? activeTask ? <DisputePage task={activeTask} action={disputeAction} onBack={() => setView("order")} onSave={handleDisputeSave} /> : <EmptyState title="暂无可争议事项" desc="订单出现可处理待办后，可以补充争议材料。" /> : null}
      </main>
    </div>
  );
}

function diagEndpointKey(endpoint: string): string {
  return endpoint.replace(/^\/+/, "").replace(/\//g, "-");
}
