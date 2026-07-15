import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Circle,
  ClipboardCheck,
  Clock3,
  Copy,
  FileCheck2,
  FileText,
  Fingerprint,
  HandCoins,
  HelpCircle,
  Layers3,
  Loader2,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Truck,
  UploadCloud,
  User,
  UserCheck,
  WalletCards
} from "lucide-react";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import type {
  ChainProofRowDTO,
  DockableModuleStatus,
  DockableZhixuModuleDTO,
  FulfillmentPluginKind,
  ParticipantDTO,
  ParticipantStatus,
  ProductOrderDTO,
  ProductTaskDTO,
  ProductTone,
  RoleSlotDTO,
  RoleSlotStatus,
  StageStatus,
  ZhixuDetailDTO,
  ZhixuStageDTO
} from "@uvp-eth/product-dto";
import {
  createProductApiClient,
  type DraftParticipantDTO,
  type EvidenceObjectDTO,
  type EvidenceProofDTO,
  type ProductApiSource,
  type ProductInviteDTO,
  type ProductOrderDraftDTO,
  type ProductWorkbenchData
} from "./product/api";
import { useOrderDraftFlow } from "./product/hooks/useOrderDraftFlow";
import { useOrderRegistrationFlow } from "./product/hooks/useOrderRegistrationFlow";
import { useProductWorkbenchData } from "./product/hooks/useProductWorkbenchData";
import {
  useProductWorkbenchE2EBridge,
  type ProductWorkbenchE2EState
} from "./product/hooks/useProductWorkbenchE2EBridge";
import { useTaskSubmissionFlow } from "./product/hooks/useTaskSubmissionFlow";
import { idleAction, type ActionState, type ProductView, type SubmitMachineState, type SubmitMachineStatus } from "./product/hooks/workbenchTypes";
import { shortHash } from "./shared/frontend";

export function ProductWorkbenchApp() {
  const api = useMemo(() => createProductApiClient(), []);
  const { loadState, reload: reloadWorkbench } = useProductWorkbenchData(api);
  const [view, setView] = useState<ProductView>("app");
  const [proofOpen, setProofOpen] = useState(false);

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
  const selectedZhixu = data?.zhixu;
  const selectedOrder = data?.order;
  const activeTask = data?.activeTask;
  const allowMockWallet = data?.source.kind === "mock";
  const draftFlow = useOrderDraftFlow({ api, selectedZhixu });
  const {
    draft,
    draftParticipants,
    draftAction,
    saveDraftAction,
    inviteActions,
    ensureDraft,
    handleCreateDraft,
    handleSaveDraft,
    handleSendInvite
  } = draftFlow;
  const { registerDraftAction, handleRegisterDraft } = useOrderRegistrationFlow({
    api,
    allowMockWallet,
    ensureDraft,
    onRegistered: (nextDraft) => {
      draftFlow.setDraft(nextDraft);
      window.setTimeout(() => setView("order"), 500);
    }
  });
  const {
    evidence,
    evidenceProof,
    evidenceAction,
    submitMachine,
    disputeAction,
    handleUploadEvidence,
    handleUploadDemoEvidence,
    handleConfirmSubmit,
    handleDisputeSave
  } = useTaskSubmissionFlow({ api, activeTask, allowMockWallet });

  async function handleNextParticipants(): Promise<void> {
    const currentDraft = await ensureDraft();
    if (currentDraft) {
      setView("participants");
    }
  }

  const e2eState: ProductWorkbenchE2EState = {
    mode: import.meta.env.MODE,
    view,
    loadStatus: loadState.status,
    sourceKind: data?.source.kind ?? null,
    apiBaseUrl: apiBaseUrlFromSource(data?.source),
    syncState: data?.syncState ?? null,
    zhixuId: selectedZhixu?.zhixuId ?? null,
    draftId: draft?.draftId ?? null,
    orderId: draft?.triggeredOrderId ?? selectedOrder?.orderId ?? null,
    taskId: activeTask?.taskId ?? null,
    evidenceId: evidence?.evidenceId ?? null,
    submissionId: submitMachine.submission?.submissionId ?? null,
    triggerTxHash: draft?.triggerTxHash ?? null,
    signalTxHash: submitMachine.submission?.txHash ?? evidence?.boundSignalTxHash ?? null
  };

  useProductWorkbenchE2EBridge({
    state: e2eState,
    acceptRequiredParticipants: draftFlow.acceptRequiredParticipants
  });

  if (loadState.status === "loading") {
    const loadingSource = api.baseUrl ? "real" : "mock";
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
          <RuntimeBanner source={loadState.source} syncing={false} />
          <section className="page-shell" data-testid="workbench-diagnostic-panel">
            <div className="state-panel error">
              <span><AlertTriangle /></span>
              <div>
                <h2>订单工作台无法加载</h2>
                <p>部分后端接口返回异常，以下是各接口状态。当前未使用开发样例数据。</p>
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
      data-uvp-api-base-url={e2eState.apiBaseUrl ?? ""}
      data-uvp-draft-id={e2eState.draftId ?? ""}
      data-uvp-evidence-id={e2eState.evidenceId ?? ""}
      data-uvp-mode={e2eState.mode}
      data-uvp-order-id={e2eState.orderId ?? ""}
      data-uvp-trigger-tx-hash={e2eState.triggerTxHash ?? ""}
      data-uvp-signal-tx-hash={e2eState.signalTxHash ?? ""}
      data-uvp-source={e2eState.sourceKind ?? ""}
      data-uvp-submission-id={e2eState.submissionId ?? ""}
      data-uvp-sync-state={e2eState.syncState ?? ""}
      data-uvp-task-id={e2eState.taskId ?? ""}
      data-uvp-view={e2eState.view}
      data-uvp-zhixu-id={e2eState.zhixuId ?? ""}
    >
      <TopNav active={activeNav} onGo={setView} />
      <main className="product-main">
        <RuntimeBanner source={data.source} syncing={data.syncState === "syncing"} />
        {loadState.status === "empty" ? <EmptyCatalogPage /> : null}
        {loadState.status === "ready" && view === "app" ? <ParticipantAppPage data={data} onCatalog={() => setView("home")} onViewDetail={() => setView("zhixu")} onCreate={() => setView("create")} onOrder={() => setView("order")} onTask={() => setView("task")} /> : null}
        {loadState.status === "ready" && view === "home" && selectedZhixu ? <CatalogPage zhixu={selectedZhixu} order={selectedOrder} task={activeTask} onViewDetail={() => setView("zhixu")} onCreate={() => setView("create")} onOrder={() => setView("order")} onTask={() => setView("task")} /> : null}
        {loadState.status === "ready" && view === "zhixu" && selectedZhixu ? <ZhixuDetailPage zhixu={selectedZhixu} onBack={() => setView("home")} onCreate={() => setView("create")} proofOpen={proofOpen} setProofOpen={setProofOpen} /> : null}
        {loadState.status === "ready" && view === "create" && selectedZhixu ? <CreateOrderPage zhixu={selectedZhixu} draft={draft} createAction={draftAction} saveAction={saveDraftAction} onBack={() => setView("zhixu")} onCreate={handleCreateDraft} onSave={handleSaveDraft} onNext={handleNextParticipants} /> : null}
        {loadState.status === "ready" && view === "participants" ? <ParticipantsPage order={selectedOrder} draft={draft} draftParticipants={draftParticipants} inviteActions={inviteActions} registerAction={registerDraftAction} onBack={() => setView("create")} onInvite={handleSendInvite} onRegister={handleRegisterDraft} onOrder={() => setView("order")} /> : null}
        {loadState.status === "ready" && view === "order" ? selectedOrder ? <OrderOverviewPage order={selectedOrder} syncing={data.syncState === "syncing" || registerDraftAction.phase === "success"} onBack={() => setView("home")} onTask={() => setView("task")} onDispute={() => setView("dispute")} proofOpen={proofOpen} setProofOpen={setProofOpen} /> : <EmptyState title="暂无进行中订单" desc="创建并启动订单后，这里会展示订单总览、当前待办和最近事件。" /> : null}
        {loadState.status === "ready" && view === "task" ? activeTask ? <TaskPage task={activeTask} evidence={evidence} evidenceProof={evidenceProof} uploadAction={evidenceAction} onBack={() => setView("order")} onUpload={handleUploadEvidence} onUploadDemo={handleUploadDemoEvidence} onSubmit={() => setView("submit")} onDispute={() => setView("dispute")} /> : <EmptyState title="暂无待办" desc="当前没有需要你处理的任务。" /> : null}
        {loadState.status === "ready" && view === "submit" ? activeTask ? <SubmitPage task={activeTask} evidence={evidence} submitMachine={submitMachine} allowRejectSimulation={allowMockWallet} onBack={() => setView("task")} onSubmit={() => void handleConfirmSubmit()} onReject={() => void handleConfirmSubmit({ rejectWallet: true })} onOrder={() => setView("order")} /> : <EmptyState title="暂无可提交的待办" desc="待办完成凭证上传后，可在这里确认提交。" /> : null}
        {loadState.status === "ready" && view === "dispute" ? activeTask ? <DisputePage task={activeTask} action={disputeAction} onBack={() => setView("order")} onSave={handleDisputeSave} /> : <EmptyState title="暂无可争议事项" desc="订单出现可处理待办后，可以补充争议材料。" /> : null}
      </main>
    </div>
  );
}

function TopNav({
  active,
  onGo
}: {
  active: string;
  onGo: (view: ProductView) => void;
}) {
  const items: Array<{ label: string; view: ProductView; badge?: string }> = [
    { label: "订单工作台", view: "app" },
    { label: "秩序库", view: "home" },
    { label: "订单", view: "order" },
    { label: "待办", view: "task", badge: "6" },
    { label: "执行方", view: "participants" },
    { label: "帮助", view: "home" }
  ];

  return (
    <header className="product-topbar">
      <button className="product-logo" onClick={() => onGo("home")}>
        <span className="product-logo-mark"><ShieldCheck /></span>
        <span className="product-logo-text"><strong>共同秩序</strong><small>订单工作台</small></span>
      </button>
      <nav className="product-nav" aria-label="主导航">
        {items.map((item) => (
          <button
            className={`product-nav-item ${active === item.label ? "is-active" : ""}`}
            key={item.label}
            onClick={() => onGo(item.view)}
          >
            {item.label}
            {item.badge ? <span className="product-nav-badge">{item.badge}</span> : null}
          </button>
        ))}
      </nav>
      <div className="product-userbar">
        <button className="icon-button" aria-label="通知"><Bell /></button>
        <span className="avatar">张</span>
        <span className="user-name">张经理</span>
        <ChevronDown className="chevron" />
      </div>
    </header>
  );
}

function ParticipantAppPage({
  data,
  onCatalog,
  onViewDetail,
  onCreate,
  onOrder,
  onTask
}: {
  data: ProductWorkbenchData;
  onCatalog: () => void;
  onViewDetail: () => void;
  onCreate: () => void;
  onOrder: () => void;
  onTask: () => void;
}) {
  const openTasks = data.tasks.filter((task) => task.status === "open");
  const blockedTasks = data.tasks.filter((task) => task.status === "blocked");
  const completedTasks = data.tasks.filter((task) => task.status === "done" || task.status === "submitted");
  const primaryTask = openTasks[0] ?? data.activeTask;
  const zhixu = data.zhixu;
  const canCreate = zhixu?.reviewStatus === "approved";

  return (
    <section className="page-shell" data-testid="participant-app-page">
      <div className="hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">普通履约者 App</span>
          <h1>我的待办</h1>
          <p>买家、卖家、报关、物流和检验方都在这里处理自己被分配的任务。不同角色看到不同任务插件，但提交后都会留下可核对证明。</p>
          <div className="hero-actions">
            {primaryTask ? <button className="primary-button" data-testid="participant-primary-task-button" onClick={onTask}><ClipboardCheck /> 处理当前待办</button> : null}
            {data.order ? <button className="secondary-button" data-testid="participant-order-room-button" onClick={onOrder}><FileText /> 打开订单房间</button> : null}
          </div>
        </div>
        <div className="hero-side">
          <SideMetric icon={<UserCheck />} label="当前身份" value={data.participant.displayName} />
          <SideMetric icon={<ClipboardCheck />} label="待处理" value={`${openTasks.length} 个待办`} />
          <SideMetric icon={<Clock3 />} label="阻塞中" value={`${blockedTasks.length} 个`} />
        </div>
      </div>

      <div className="content-layout">
        <div className="main-stack">
          <Panel>
            <div className="panel-heading">
              <div>
                <h2>待办队列</h2>
                <p>{data.participant.roleLabels.length > 0 ? `当前角色：${data.participant.roleLabels.join("、")}` : "连接钱包或接受邀请后，只展示你能处理的任务。"}</p>
              </div>
              <button className="secondary-button" onClick={onCatalog}>查看秩序库</button>
            </div>
            <div className="main-stack">
              {data.tasks.length > 0 ? data.tasks.map((task) => (
                <article className="task-card" data-testid="participant-task-card" key={task.taskId}>
                  <div>
                    <div className="panel-heading compact">
                      <div>
                        <h3>{task.title}</h3>
                        <p>{task.orderTitle} · {task.participantRoleLabel ?? task.assigneeRole}</p>
                      </div>
                      <StatusBadge tone={task.status === "open" ? "info" : task.status === "blocked" ? "warning" : "success"}>{participantTaskStatusLabel(task.status)}</StatusBadge>
                    </div>
                    <div className="catalog-facts">
                      <FactRow icon={<Layers3 />} label="任务插件" value={pluginKindLabel(task.capabilityPlugin?.pluginKind)} />
                      <FactRow icon={<FileCheck2 />} label="需要凭证" value={task.requiredEvidence.join("、")} />
                      <FactRow icon={<HandCoins />} label="付款影响" value={task.fundingImpact} />
                    </div>
                    {task.settlementPreview ? (
                      <div className="plain-help-box">
                        <HandCoins />
                        <div>
                          <strong>{task.settlementPreview.label}</strong>
                          <p>{task.settlementPreview.disclaimer}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="catalog-card-actions">
                    <strong>{task.primaryActionLabel ?? "处理待办"}</strong>
                    <small>{task.deadline}</small>
                    <button className={task.status === "open" ? "primary-button block" : "secondary-button block"} onClick={onTask} disabled={task.status === "blocked"}>{task.status === "open" ? "进入处理" : "查看详情"}</button>
                  </div>
                </article>
              )) : <InlineEmpty text="当前钱包暂无待办" />}
            </div>
          </Panel>
        </div>

        <aside className="right-stack">
          <SidePanel title="推荐秩序">
            {zhixu ? (
              <div className="quick-order-card">
                <strong>{zhixu.title}</strong>
                <span>{zhixu.subtitle}</span>
                <button className={canCreate ? "primary-button block" : "disabled-button block"} data-testid="catalog-create-order-button" onClick={canCreate ? onCreate : undefined} disabled={!canCreate}>创建订单</button>
                <button className="secondary-button block" data-testid="catalog-detail-button" onClick={onViewDetail}>查看秩序详情</button>
              </div>
            ) : <InlineEmpty text="暂无已审核秩序" />}
          </SidePanel>
          <SidePanel title="最近完成">
            {completedTasks.length > 0 ? completedTasks.map((task) => (
              <MiniTask key={task.taskId} title={task.title} detail={task.proofSummary?.label ?? "已留下证明"} onClick={onOrder} />
            )) : <InlineEmpty text="暂无已完成待办" />}
          </SidePanel>
        </aside>
      </div>
    </section>
  );
}

function CatalogPage({
  zhixu,
  order,
  task,
  onViewDetail,
  onCreate,
  onOrder,
  onTask
}: {
  zhixu: ZhixuDetailDTO;
  order?: ProductOrderDTO | undefined;
  task?: ProductTaskDTO | undefined;
  onViewDetail: () => void;
  onCreate: () => void;
  onOrder: () => void;
  onTask: () => void;
}) {
  const canCreate = zhixu.reviewStatus === "approved";
  return (
    <section className="page-shell" data-testid="catalog-page">
      <section className="store-hero">
        <div>
          <StatusBadge icon={<ShieldCheck />} tone="success">共同秩序审核</StatusBadge>
          <h1>把跨境订单拆成每个人看得懂的待办</h1>
          <p>选择审核过的秩序，邀请买家、卖家、物流、检验方按同一套规则协作。每次确认都会留下可核对的证明，方便后续付款、验收和争议处理。</p>
          <div className="button-row">
            <button className={canCreate ? "primary-button" : "disabled-button"} data-testid="catalog-create-order-button" onClick={canCreate ? onCreate : undefined} disabled={!canCreate}>创建订单</button>
            <button className="secondary-button" data-testid="catalog-detail-button" onClick={onViewDetail}>查看秩序详情</button>
          </div>
        </div>
        <aside className="hero-status-panel">
          <SideMetric icon={<ShieldCheck />} label="推荐秩序" value={zhixu.reviewLabel} tone="success" />
          <SideMetric icon={<FileText />} label="进行中订单" value={order?.title ?? "暂无订单"} />
          <SideMetric icon={<ClipboardCheck />} label="我的待办" value={task?.title ?? "暂无待办"} />
        </aside>
      </section>

      <div className="catalog-toolbar">
        <label className="catalog-search">
          <Search />
          <input placeholder="搜索业务、角色或凭证，例如：车辆、报关、验收" />
        </label>
        <div className="catalog-filter-row">
          {["全部", "平行出口车", "工业设备", "高价值货物"].map((item, index) => (
            <button className={`filter-chip ${index === 0 ? "is-active" : ""}`} key={item}>{item}</button>
          ))}
        </div>
      </div>

      <div className="content-layout">
        <div className="main-stack">
          <Panel>
            <div className="panel-heading">
              <div>
                <h2>推荐秩序</h2>
                <p>只展示已通过共同秩序审核、适合创建新订单的秩序。</p>
              </div>
              <StatusBadge tone="success">{zhixu.reviewLabel}</StatusBadge>
            </div>
            <article className="catalog-card">
              <div className="catalog-card-main">
                <h3>{zhixu.title}</h3>
                <p>{zhixu.subtitle}</p>
                <div className="tag-row">
                  {zhixu.applicableBusiness.map((item) => <span key={item}>{item}</span>)}
                </div>
                <div className="catalog-facts">
                  <FactRow icon={<UserCheck />} label="参与角色" value={`${zhixu.roleSlotCount} 类`} />
                  <FactRow icon={<Layers3 />} label="订单阶段" value={`${zhixu.stageCount} 个`} />
                  <FactRow icon={<WalletCards />} label="付款方式" value={zhixu.supportedPaymentMethods.join("、")} />
                </div>
              </div>
              <div className="catalog-card-actions">
                <button className={canCreate ? "primary-button block" : "disabled-button block"} data-testid="catalog-card-create-order-button" onClick={canCreate ? onCreate : undefined} disabled={!canCreate}>用此秩序创建订单</button>
                <button className="secondary-button block" data-testid="catalog-card-detail-button" onClick={onViewDetail}>查看角色和阶段</button>
              </div>
            </article>
          </Panel>
        </div>

        <aside className="right-stack">
          <SidePanel title="进行中的订单" action="查看全部">
            {order ? (
              <button className="quick-order-card" onClick={onOrder}>
                <strong>{order.title}</strong>
                <span>{order.statusLabel} · {order.currentStageName}</span>
                <small>{order.currentTaskTitle}</small>
              </button>
            ) : <InlineEmpty text="暂无进行中订单" />}
          </SidePanel>
          <SidePanel title="我的待办">
            {task ? (
              <button className="quick-order-card" onClick={onTask}>
                <strong>{task.title}</strong>
                <span>{task.assigneeRole} · {task.deadline}</span>
                <small>{task.fundingImpact}</small>
              </button>
            ) : <InlineEmpty text="暂无待办" />}
          </SidePanel>
          <div className="plain-help-box">
            <ShieldCheck />
            <div>
              <strong>用户不需要理解底层技术</strong>
              <p>创建订单、提交凭证、确认责任和处理争议都在这个工作台完成。高级证明只在需要核对时展开。</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ZhixuDetailPage({
  zhixu,
  onBack,
  onCreate,
  proofOpen,
  setProofOpen
}: {
  zhixu: ZhixuDetailDTO;
  onBack: () => void;
  onCreate: () => void;
  proofOpen: boolean;
  setProofOpen: (value: boolean) => void;
}) {
  const canCreate = zhixu.reviewStatus === "approved";
  return (
    <section className="page-shell" data-testid="zhixu-detail-page">
      <BackLine onClick={onBack}>返回秩序库</BackLine>
      <div className="page-title-row">
        <div>
          <h1>{zhixu.title}</h1>
          <p>{zhixu.subtitle}</p>
        </div>
        <StatusBadge icon={<ShieldCheck />} tone={zhixu.reviewStatus === "approved" ? "success" : "warning"}>{zhixu.reviewLabel}</StatusBadge>
      </div>

      <div className="notice-grid">
        <NoticeCard icon={<ShieldCheck />} tone="success" title={`适用业务：${zhixu.applicableBusiness.join("、")}`} />
        <NoticeCard icon={<AlertTriangle />} tone="warning" title={`不适用业务：${zhixu.excludedBusiness.join("、")}`} />
      </div>

      <div className="content-layout">
        <div className="main-stack">
          <Panel>
            <div className="panel-heading">
              <div>
                <h2>参与角色与责任</h2>
                <p>每个角色看到自己的责任、凭证和当前状态，订单按确认结果继续推进。</p>
              </div>
            </div>
            <RoleDockMap roleSlots={zhixu.roleSlots} />
          </Panel>

          <Panel>
            <div className="panel-heading">
              <div>
                <h2>可扩展协作模块</h2>
                <p>可按业务需要接入资金保障、物流、验收和争议处理模块。</p>
              </div>
            </div>
            <DockableModules modules={zhixu.dockableModules} />
          </Panel>

          <Panel>
            <div className="panel-heading">
              <div>
                <h2>阶段与所需凭证</h2>
                <p>阶段用于说明订单推进顺序；每个阶段都有负责人和凭证要求。</p>
              </div>
              <button className="light-button"><FileText /> 下载秩序图</button>
            </div>
            <StageList mode="zhixu" stages={zhixu.stages} />
          </Panel>

          <ProofPanel
            open={proofOpen}
            proofRows={zhixu.proofRows}
            onToggle={() => setProofOpen(!proofOpen)}
            compactText={zhixu.planPublication.label}
          />
        </div>

        <aside className="side-card create-side">
          <h2>创建订单</h2>
          <SideMetric icon={<ShieldCheck />} label="风险等级" value={zhixu.riskLevel} tone="success" />
          <SideMetric icon={<PackageCheck />} label="所需角色" value={`${zhixu.roleSlotCount} 类角色`} />
          <SideMetric icon={<Layers3 />} label="预计阶段" value={`${zhixu.stageCount} 个`} />
          <SideMetric icon={<WalletCards />} label="支持付款方式" value={zhixu.supportedPaymentMethods.join("、")} />
          <SideMetric icon={<UserCheck />} label="维护方" value={zhixu.maintainer} />
          <button className={canCreate ? "primary-button block" : "disabled-button block"} data-testid="zhixu-create-order-button" onClick={canCreate ? onCreate : undefined} disabled={!canCreate}>用此秩序创建订单</button>
          <p className="side-note"><HelpCircle /> {zhixu.createOrderHint}</p>
        </aside>
      </div>
    </section>
  );
}

function CreateOrderPage({
  zhixu,
  draft,
  createAction,
  saveAction,
  onBack,
  onCreate,
  onSave,
  onNext
}: {
  zhixu: ZhixuDetailDTO;
  draft?: ProductOrderDraftDTO | undefined;
  createAction: ActionState;
  saveAction: ActionState;
  onBack: () => void;
  onCreate: () => void;
  onSave: () => void;
  onNext: () => void;
}) {
  const canCreate = zhixu.reviewStatus === "approved";
  return (
    <section className="page-shell" data-testid="create-order-page">
      <BackLine onClick={onBack}>返回秩序详情</BackLine>
      <h1>创建跨境订单</h1>
      <StepBar current={2} steps={["确认秩序", "订单信息", "参与方", "付款条件", "预览并发起"]} />
      {!canCreate ? <StatePanel icon={<AlertTriangle />} title="该秩序当前不可创建新订单" desc="请换用已审核且未撤销的秩序。" tone="error" /> : null}
      <div className="content-layout">
        <Panel>
          <h2>订单信息</h2>
          <div className="form-grid">
            <Field label="订单名称" required value="A 公司采购 10 台车辆" />
            <ChoiceGroup label="标的物类型" options={["车辆", "工业设备", "其他高价值货物"]} active="车辆" />
            <Field label="VIN" required value="JTDBE40K903012345" />
            <Field label="品牌型号" required value="Toyota Land Cruiser 300 VX-R" />
            <Field label="数量" required value="10" suffix="台" />
            <Field label="总金额" required value="10,000" />
            <SelectField label="币种" required value="USDC" />
            <SelectField label="出口国家/地区" required value="日本" />
            <SelectField label="目的国家/地区" required value="阿联酋" />
            <Field label="预计完成日期" required value="2026-07-31" icon={<CalendarDays />} />
            <Textarea label="备注" value="请按合同约定的分阶段交付计划执行。" />
          </div>
        </Panel>
        <aside className="side-card">
          <h2>订单摘要</h2>
          <SideMetric label="使用秩序" value={zhixu.title} />
          <SideMetric label="审核状态" value={<StatusBadge icon={<ShieldCheck />} tone={zhixu.reviewStatus === "approved" ? "success" : "warning"}>{zhixu.reviewLabel}</StatusBadge>} />
          <SideMetric label="阶段数" value={String(zhixu.stageCount)} />
          <SideMetric label="当前还需要" value="邀请买家、卖家、报关行、物流、检验方" />
          <SideMetric label="草稿状态" value={draft ? draftStatusLabel(draft.status) : "尚未创建"} />
          <NoticeCard icon={<ShieldCheck />} tone="success" title={`适用业务：${zhixu.applicableBusiness.join("、")}`} />
          <ActionNotice state={createAction} />
          <ActionNotice state={saveAction} />
        </aside>
      </div>
      <BottomActions>
        <button className="secondary-button" onClick={onBack}>上一步</button>
        <button className="secondary-button" data-testid="save-draft-button" onClick={onSave} disabled={!canCreate || saveAction.phase === "pending"}>{saveAction.phase === "pending" ? <Loader2 className="spin" /> : null}保存草稿</button>
        <button className="secondary-button" data-testid="create-draft-button" onClick={onCreate} disabled={!canCreate || createAction.phase === "pending"}>{createAction.phase === "pending" ? <Loader2 className="spin" /> : null}{draft ? "重新创建草稿" : "创建订单"}</button>
        <button className="primary-button" data-testid="next-participants-button" onClick={onNext} disabled={!canCreate || createAction.phase === "pending"}>下一步</button>
      </BottomActions>
    </section>
  );
}

function ParticipantsPage({
  order,
  draft,
  draftParticipants,
  inviteActions,
  registerAction,
  onBack,
  onInvite,
  onRegister,
  onOrder
}: {
  order?: ProductOrderDTO | undefined;
  draft?: ProductOrderDraftDTO | undefined;
  draftParticipants: readonly DraftParticipantDTO[];
  inviteActions: Readonly<Record<string, ActionState & { readonly invite?: ProductInviteDTO | undefined }>>;
  registerAction: ActionState;
  onBack: () => void;
  onInvite: (participant: DraftParticipantDTO) => void;
  onRegister: () => void;
  onOrder: () => void;
}) {
  if (!draft) {
    return (
      <section className="page-shell">
        <BackLine onClick={onBack}>返回订单信息</BackLine>
        <EmptyState title="请先创建订单草稿" desc="创建草稿后，系统会生成参与方清单和邀请链接。" />
      </section>
    );
  }
  const requiredReady = draftParticipants.filter((item) => item.required).every((item) =>
    item.status === "accepted"
  );
  return (
    <section className="page-shell">
      <BackLine onClick={onBack}>返回订单信息</BackLine>
      <h1>邀请参与方确认职责</h1>
      <p className="page-subtitle">订单开始前，关键参与方需要确认自己的阶段和责任。</p>
      <div className="summary-strip">
        <SummaryItem icon={<FileText />} title={draft.title} />
        <SummaryItem icon={<HandCoins />} title={`总金额 ${draft.totalAmount} ${draft.currency}`} />
        <SummaryItem icon={<ShieldCheck />} title={draftStatusLabel(draft.status)} tone="success" />
      </div>
      <div className="content-layout">
        <Panel>
          <h2>参与方及职责</h2>
          <div className="participant-table">
            <div className="participant-head">
              <span>角色</span>
              <span>责任阶段</span>
              <span>需要提交或确认的凭证</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            {draftParticipants.map((item) => {
              const action = inviteActions[item.participantId];
              const actionState = action ?? idleAction;
              return (
              <div className="participant-row" data-testid="participant-row" data-uvp-participant-required={item.required ? "true" : "false"} data-uvp-participant-status={item.status} key={item.participantId}>
                <div className="participant-role">
                  <span className="role-icon">{roleSlotIcon(item.roleSlotId)}</span>
                  <strong>{item.roleLabel}</strong>
                </div>
                <p>{item.required ? "关键参与方，需要确认职责" : "可选参与方，可稍后邀请"}</p>
                <div className="evidence-list"><span><FileText />职责确认</span></div>
                <StatusText tone={draftParticipantTone(item.status)}>{draftParticipantStatusLabel(item.status)}</StatusText>
                <div className="row-actions">
                  <button className={item.status === "missing" ? "primary-mini" : "light-button"} onClick={() => onInvite(item)} disabled={actionState.phase === "pending"}>
                    {actionState.phase === "pending" ? <Loader2 className="spin" /> : null}{draftParticipantActionLabel(item.status)}
                  </button>
                  {action?.invite?.inviteUrl ? <button className="light-button" onClick={() => void navigator.clipboard?.writeText(action.invite?.inviteUrl ?? "")}><Copy /> 复制链接</button> : <button className="light-button" onClick={() => onInvite(item)}>替换</button>}
                </div>
                <ActionNotice state={actionState} compact />
              </div>
            );})}
          </div>
          <button className={requiredReady ? "primary-button block" : "disabled-button block"} data-testid="register-order-button" onClick={requiredReady ? onRegister : undefined} disabled={!requiredReady || registerAction.phase === "pending"}>
            {registerAction.phase === "pending" ? <Loader2 className="spin" /> : <LockKeyhole />} 全部关键方确认后启动订单
          </button>
          <p className="center-note">仅当所有启动条件满足后，启动按钮才会可用。</p>
          <ActionNotice state={registerAction} />
        </Panel>
        <aside className="side-card">
          <h2>订单启动条件</h2>
          {draftParticipants.filter((item) => item.required).map((item) => (
            <Condition
              key={item.participantId}
              status={item.status === "accepted" ? "done" : "warn"}
              title={`${item.roleLabel}：${draftParticipantStatusLabel(item.status)}`}
              desc={item.status === "accepted" ? "已接受邀请并确认职责" : item.status === "invited" ? "已邀请，等待对方接受" : "待发送邀请并确认职责"}
            />
          ))}
          {!requiredReady ? (
            <div className="warning-box">
              <AlertTriangle />
              <div>
                <strong>当前订单无法启动</strong>
                <p>请邀请所有关键参与方，所有启动条件满足后，订单将可启动。</p>
              </div>
            </div>
          ) : null}
          {order ? <button className="secondary-button block" onClick={onOrder}>查看进行中订单</button> : null}
        </aside>
      </div>
    </section>
  );
}

function OrderOverviewPage({
  order,
  syncing,
  onBack,
  onTask,
  onDispute,
  proofOpen,
  setProofOpen
}: {
  order: ProductOrderDTO;
  syncing: boolean;
  onBack: () => void;
  onTask: () => void;
  onDispute: () => void;
  proofOpen: boolean;
  setProofOpen: (value: boolean) => void;
}) {
  return (
    <section className="page-shell" data-testid="order-overview-page">
      <BackLine onClick={onBack}>返回订单列表</BackLine>
      <div className="page-title-row">
        <h1>{order.title}</h1>
        <StatusBadge tone={syncing ? "info" : "success"}>{syncing ? "同步中" : order.statusLabel}</StatusBadge>
      </div>
      {syncing ? <StatePanel icon={<RefreshCw className="spin" />} title="订单状态同步中" desc="提交已发出，订单页正在等待后端投影更新。" tone="info" /> : null}
      <div className="order-kpis">
        <Kpi label="总金额" value={order.totalAmount.display} />
        <Kpi label="付款条件" value={order.fundingStatus} icon={<ShieldCheck />} tone="success" />
        <Kpi label="当前阶段" value={order.currentStageName} icon={<Layers3 />} tone="success" />
      </div>
      <div className="content-layout">
        <div className="main-stack">
          <section className="current-task-card">
            <div className="task-bell"><Bell /></div>
            <div>
              <span className="eyebrow">当前待办</span>
              <h2>{order.currentTaskTitle}</h2>
              <dl className="task-facts">
                <div><dt>负责人</dt><dd>{currentAssignee(order)}</dd></div>
                <div><dt>截止时间</dt><dd>2026-05-03 18:00 <strong>剩余 2 天 6 小时</strong></dd></div>
                <div><dt>需要凭证</dt><dd>报关单 PDF、报关单号、出口港口、完成时间</dd></div>
                <div><dt>订单影响</dt><dd>{order.currentTaskSummary}</dd></div>
              </dl>
              <div className="button-row">
                <button className="primary-button" data-testid="order-current-task-button" onClick={onTask}><Send /> 查看待办</button>
                <button className="outline-button" onClick={onDispute}><ShieldCheck /> 提出争议</button>
                <button className="outline-button" onClick={onTask}><ClipboardCheck /> 查看我的待办</button>
              </div>
            </div>
          </section>
          <Panel>
            <h2>阶段进度</h2>
            <StageProgressTable stages={order.stages} />
          </Panel>
          <ProofPanel open={proofOpen} proofRows={order.proofRows} onToggle={() => setProofOpen(!proofOpen)} compactText="已有确认记录可核对" />
        </div>
        <aside className="right-stack">
          <SidePanel title="参与方状态">
            {order.participants.map((item) => (
              <ParticipantStatus key={item.participantId} active={item.participantId === "customs"} text={`${item.role} ${participantStatusLabel(item.status)}`} />
            ))}
          </SidePanel>
          <SidePanel title="付款条件">
            <MoneyRow label="订单金额" value={order.totalAmount.display} />
            <MoneyRow label="已满足条件" value="5,000 USDC（50%）" />
            <MoneyRow label="待满足条件" value="5,000 USDC（50%）" />
            <MoneyRow label="保障确认" value={order.fundingStatus} success />
            <span className="text-button as-label">付款条件来自订单状态</span>
          </SidePanel>
          <SidePanel title="最近事件" action="查看全部">
            {order.recentEvents.map((event) => <EventLine key={event.eventId} text={event.text} time={event.time} />)}
          </SidePanel>
          <div className="warning-box">
            <AlertTriangle />
            <p>距离报关完成截止时间不足 3 天，请及时跟进，避免影响后续付款条件。</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function TaskPage({
  task,
  evidence,
  evidenceProof,
  uploadAction,
  onBack,
  onUpload,
  onUploadDemo,
  onSubmit,
  onDispute
}: {
  task: ProductTaskDTO;
  evidence?: EvidenceObjectDTO | undefined;
  evidenceProof?: EvidenceProofDTO | undefined;
  uploadAction: ActionState;
  onBack: () => void;
  onUpload: (file: File) => void;
  onUploadDemo: () => void;
  onSubmit: () => void;
  onDispute: () => void;
}) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) {
      onUpload(file);
    }
  }

  return (
    <section className="page-shell" data-testid="task-detail-page">
      <BackLine onClick={onBack}>返回待办列表</BackLine>
      <h1>{task.title}</h1>
      <p className="page-subtitle">{task.subtitle}</p>
      <div className="summary-strip task-summary">
        <SummaryItem icon={<FileText />} label="订单" title={task.orderTitle} />
        <SummaryItem icon={<Layers3 />} label="阶段" title={task.stageName} />
        <SummaryItem icon={<Clock3 />} label="截止时间" title={task.deadline} />
        <SummaryItem icon={<PackageCheck />} label="提交后影响" title={task.fundingImpact} />
      </div>
      <div className="content-layout">
        <Panel>
          <h2>上传报关凭证</h2>
          <p>请上传报关单 PDF，并填写以下信息。</p>
          <label className="upload-zone">
            <UploadCloud />
            <strong>将文件拖拽到此处，或点击选择文件</strong>
            <span>仅支持 PDF 格式，单个文件不超过 50MB</span>
            <input className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,.json,application/pdf,image/*,application/json" onChange={handleFileChange} />
          </label>
          <button className="secondary-button" data-testid="upload-demo-evidence-button" onClick={onUploadDemo} disabled={uploadAction.phase === "pending"}>{uploadAction.phase === "pending" ? <Loader2 className="spin" /> : <UploadCloud />} 上传开发样例凭证</button>
          <ActionNotice state={uploadAction} />
          {evidence ? (
            <div className="uploaded-file">
              <FileText />
              <div>
                <strong>{evidence.fileName}</strong>
                <span>{formatBytes(evidence.size)} · 指纹 {shortHash(evidence.payloadHash)}</span>
              </div>
              <StatusText tone="ok">{evidenceProof?.verificationStatus === "matched" ? "已绑定" : "已上传 · 已生成凭证指纹"}</StatusText>
            </div>
          ) : (
            <InlineEmpty text="尚未上传凭证" />
          )}
          <div className="two-col">
            <Field label="填写报关单号" required placeholder="请输入报关单号" />
            <SelectField label="选择出口港口" required value="请选择出口港口" />
            <Field label="填写完成时间" required value="选择完成时间" icon={<CalendarDays />} />
          </div>
          <Textarea label="备注（选填）" placeholder="请输入备注信息（如有特殊说明可在此填写）" />
        </Panel>
        <aside className="side-card">
          <h2>责任确认</h2>
          {task.responsibilityStatements.map((statement) => (
            <CheckStatement key={statement.title} title={statement.title} desc={statement.desc} />
          ))}
          <button className={evidence ? "primary-button block" : "disabled-button block"} data-testid="task-confirm-button" onClick={evidence ? onSubmit : undefined} disabled={!evidence}>确认报关完成</button>
          <div className="split-actions">
            <button className="secondary-button" onClick={onDispute}>无法完成</button>
            <button className="secondary-button" onClick={onDispute}>提出争议</button>
          </div>
          <p className="side-note"><HelpCircle /> 如需帮助，请联系平台运营或查看帮助中心。</p>
        </aside>
      </div>
    </section>
  );
}

function SubmitPage({
  task,
  evidence,
  submitMachine,
  allowRejectSimulation,
  onBack,
  onSubmit,
  onReject,
  onOrder
}: {
  task: ProductTaskDTO;
  evidence?: EvidenceObjectDTO | undefined;
  submitMachine: SubmitMachineState;
  allowRejectSimulation: boolean;
  onBack: () => void;
  onSubmit: () => void;
  onReject: () => void;
  onOrder: () => void;
}) {
  const [proofOpen, setProofOpen] = useState(false);
  const pending = submitMachine.status === "preparing" ||
    submitMachine.status === "signature_pending" ||
    submitMachine.status === "tx_pending";
  const confirmed = submitMachine.status === "confirmed";
  const failed = submitMachine.status === "failed" ||
    submitMachine.status === "wallet_not_connected" ||
    submitMachine.status === "wallet_rejected";
  const proofRows = submitMachine.submission?.proofRows ?? task.proofRows;
  return (
    <section className="page-shell" data-testid="submit-page">
      <BackLine onClick={onBack}>返回待办详情</BackLine>
      <h1>确认报关完成 / 提交结果</h1>
      <p className="page-subtitle">请确认凭证指纹和责任声明，钱包授权后会进入提交中状态。</p>
      <div className="submit-layout">
        <Panel>
          <StatusBadge tone="info">确认提交</StatusBadge>
          <h2>确认报关完成</h2>
          <p>请确认你将代表 {task.assigneeRole} 提交本阶段完成确认。</p>
          <ul className="confirm-list">
            <li><strong>订单：</strong>{task.orderTitle}</li>
            <li><strong>阶段：</strong>{task.stageName}</li>
            <li><strong>提交凭证：</strong>{task.requiredEvidence.join("、")}</li>
            <li><strong>凭证指纹：</strong>{evidence ? shortHash(evidence.payloadHash) : "待上传"}</li>
            <li><strong>影响：</strong>{task.fundingImpact}</li>
            <li><strong>责任提示：</strong><em>提交后不可删除，只能追加更正或进入争议</em></li>
          </ul>
          <h3>签名前摘要</h3>
          <div className="auth-options">
            <div className="auth-option is-selected">
              <span><WalletCards /></span>
              <div>
                <strong>{submitMachine.prepared?.summary.actionLabel ?? "确认本阶段完成"}</strong>
                <p>{submitMachine.prepared ? `授权有效期至 ${formatDateTime(submitMachine.prepared.summary.authorizationValidUntil)}` : "点击确认后会生成可读摘要并请求钱包授权。"}</p>
              </div>
              <CheckCircle2 />
            </div>
          </div>
          <button className="primary-button block" data-testid="submit-confirm-button" onClick={onSubmit} disabled={!evidence || pending}>
            {pending ? <Loader2 className="spin" /> : <WalletCards />} 确认并提交
          </button>
          {allowRejectSimulation ? <button className="secondary-button block" onClick={onReject} disabled={!evidence || pending}>模拟钱包拒绝</button> : null}
        </Panel>
        <Panel tone={confirmed ? "success" : "muted"}>
          <StatusBadge tone={confirmed ? "success" : failed ? "warning" : "info"}>{submitStatusLabel(submitMachine.status)}</StatusBadge>
          <div className="success-hero">
            <span className={failed ? "danger" : ""}>{confirmed ? <Check /> : pending ? <Loader2 className="spin" /> : failed ? <AlertTriangle /> : <Clock3 />}</span>
            <h2>{confirmed ? "已确认报关完成" : submitStatusTitle(submitMachine.status)}</h2>
            <p>{submitMachine.message}</p>
          </div>
          <ul className="success-list">
            <li><CheckCircle2 /> 凭证指纹{evidence ? "已生成" : "待生成"}</li>
            <li>{submitMachine.prepared ? <CheckCircle2 /> : <Circle />} 签名前摘要{submitMachine.prepared ? "已生成" : "待生成"}</li>
            <li>{submitMachine.submission ? <CheckCircle2 /> : <Circle />} 提交记录{submitMachine.submission ? submitMachine.submission.statusLabel : "待创建"}</li>
            <li>{confirmed ? <CheckCircle2 /> : <Clock3 />} 下一步：等待订单页同步</li>
          </ul>
          <div className="button-row centered">
            <button className="secondary-button" onClick={onOrder}>返回订单</button>
            <button className="primary-button" data-testid="advanced-proof-button" onClick={() => setProofOpen(!proofOpen)}>查看高级证明</button>
          </div>
          {proofOpen ? (
            <div className="proof-box" data-testid="advanced-proof-box">
              <div className="proof-box-title"><ShieldCheck /> 高级链上证明</div>
              {proofRows.map((row) => <MoneyRow key={row.label} label={row.label} value={row.value} />)}
              {submitMachine.submission?.txHash ? <MoneyRow label="交易编号" value={submitMachine.submission.txHash} /> : null}
              {evidence ? <MoneyRow label="凭证指纹" value={evidence.payloadHash} /> : null}
            </div>
          ) : null}
        </Panel>
      </div>
    </section>
  );
}

function DisputePage({
  task,
  action,
  onSave,
  onBack
}: {
  task: ProductTaskDTO;
  action: ActionState;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <section className="page-shell">
      <BackLine onClick={onBack}>返回订单</BackLine>
      <h1>对{task.stageName}凭证提出争议</h1>
      <p className="page-subtitle">当您认为“{task.stageName}”凭证存在问题时，可发起争议。发起后将进入争议处理，由平台裁定并同步双方。</p>
      <div className="dispute-grid">
        <Panel>
          <h2>争议信息</h2>
          <div className="form-grid">
            <Field label="争议对象" value={`${task.stageName}阶段`} />
            <SelectField label="争议原因" required value="请选择争议原因" />
            <Textarea label="说明" required placeholder="请说明争议原因，例如凭证不清晰、信息不一致、未按时完成等" />
            <label className="upload-zone small">
              <UploadCloud />
              <strong>点击上传或拖拽文件到此处</strong>
              <span>支持 PDF、JPG、PNG 格式，单个文件不超过 20MB</span>
            </label>
          </div>
          <button className="primary-button align-right" onClick={onSave} disabled={action.phase === "pending"}>{action.phase === "pending" ? <Loader2 className="spin" /> : null}提交争议</button>
          <ActionNotice state={action} />
        </Panel>
        <Panel>
          <h2>相关事实</h2>
          <FactRow icon={<Clock3 />} label="报关行提交时间" value="2026-05-16 14:32:08" />
          <FactRow icon={<FileText />} label="已提交凭证" value="报关单.pdf、出口发票.pdf、营业执照副本.pdf" />
          <FactRow icon={<Fingerprint />} label="凭证指纹" value="a4b7c3d9e1f2a0b8c6d4e7f1a3b9c2d5" />
          <FactRow icon={<User />} label="负责人" value="上海捷通报关有限公司｜李建国" />
          <FactRow icon={<HandCoins />} label="付款影响" value="争议期间第 2 阶段付款条件暂停" danger />
          <div className="warning-box">
            <AlertTriangle />
            <p>在争议处理完成前，该阶段付款条件将处于暂停状态。</p>
          </div>
        </Panel>
      </div>
      <Panel>
        <h2>争议处理时间线</h2>
        <div className="dispute-timeline">
          {["提出争议", "等待对方回应", "补充凭证", "裁定中", "已处理"].map((label, index) => (
            <div className={`dispute-step ${index === 0 ? "is-current" : ""}`} key={label}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
              <p>{index === 0 ? "您已提交争议，等待对方回应" : index === 1 ? "平台已通知报关行，请在 2 个工作日内回应" : index === 2 ? "如有需要，双方可补充凭证" : index === 3 ? "平台裁定并通知双方，预计 1-3 个工作日" : "争议已完成并归档"}</p>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function RuntimeBanner({ source, syncing }: { source: ProductApiSource; syncing: boolean }) {
  if (source.kind === "real" && !syncing) {
    return null;
  }
  return (
    <div className={`runtime-banner ${source.kind === "mock" ? "is-mock" : "is-syncing"}`}>
      {source.kind === "mock" ? <AlertTriangle /> : <RefreshCw className="spin" />}
      <div>
        <strong>{source.kind === "mock" ? "开发样例模式" : "订单状态同步中"}</strong>
        <p>{source.kind === "mock" ? source.reason : "后端正在同步最新确认结果，页面会展示当前可用状态。"}</p>
      </div>
    </div>
  );
}

function apiBaseUrlFromSource(source: ProductApiSource | undefined): string | null {
  if (!source) {
    return null;
  }
  return source.kind === "real" ? source.baseUrl : source.baseUrl ?? null;
}

function EmptyCatalogPage() {
  return <EmptyState title="暂无可创建订单的秩序" desc="当前没有已审核且可用于创建新订单的秩序。" />;
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <section className="page-shell">
      <StatePanel icon={<FileText />} title={title} desc={desc} />
    </section>
  );
}

function InlineEmpty({ text }: { text: string }) {
  return <div className="inline-empty">{text}</div>;
}

function StatePanel({
  icon,
  title,
  desc,
  tone = "muted"
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  tone?: "muted" | "info" | "error" | undefined;
}) {
  return (
    <section className={`state-panel ${tone}`}>
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </section>
  );
}

function ActionNotice({ state, compact }: { state: ActionState; compact?: boolean }) {
  if (state.phase === "idle") {
    return null;
  }
  const icon = state.phase === "pending"
    ? <Loader2 className="spin" />
    : state.phase === "success"
      ? <CheckCircle2 />
      : <AlertTriangle />;
  return (
    <div className={`action-notice ${state.phase} ${compact ? "compact" : ""}`}>
      {icon}
      <span>{state.message}</span>
      {state.source?.kind === "mock" ? <small>开发样例</small> : null}
    </div>
  );
}

function RoleDockMap({ roleSlots }: { roleSlots: readonly RoleSlotDTO[] }) {
  return (
    <div className="role-dock-map">
      <div className="role-dock-center">
        <span><PackageCheck /></span>
        <strong>订单协作</strong>
        <p>所有参与方按同一规则推进</p>
      </div>
      <div className="role-slot-grid">
        {roleSlots.map((slot) => (
          <article className={`role-slot-card ${slot.tone}`} key={slot.title}>
            <div className="role-slot-head">
              <span className="role-slot-icon">{roleSlotIcon(slot.slotId)}</span>
              <div>
                <strong>{slot.title}</strong>
                <p>{slot.label}</p>
              </div>
              <StatusText tone={slot.tone}>{roleSlotStatusLabel(slot.status)}</StatusText>
            </div>
            <p>{slot.duty}</p>
            <div className="evidence-inline">
              {slot.evidence.map((item) => <span key={item}><FileText />{item}</span>)}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function DockableModules({ modules }: { modules: readonly DockableZhixuModuleDTO[] }) {
  return (
    <div className="dock-module-grid">
      {modules.map((module) => (
        <article className="dock-module-card" key={module.title}>
          <div className="dock-module-title">
            <span>{dockableModuleIcon(module.moduleId)}</span>
            <div>
              <strong>{module.title}</strong>
              <p>{module.desc}</p>
            </div>
            <StatusBadge tone={module.status === "connected" ? "success" : module.status === "planned" ? "info" : "default"}>
              {dockableModuleStatusLabel(module.status)}
            </StatusBadge>
          </div>
          <div className="dock-port-row">
            {module.ports.map((port) => <span key={port}>{port}</span>)}
          </div>
        </article>
      ))}
    </div>
  );
}

function StageList({ mode, stages }: { mode: "zhixu"; stages: readonly ZhixuStageDTO[] }) {
  return (
    <div className={`stage-list stage-list-${mode}`}>
      {stages.map((stage) => (
        <div className="stage-line-row" key={stage.name}>
          <span className="stage-index">{stage.index}</span>
          <strong>{stage.name}</strong>
          <span className="required-label">所需凭证：</span>
          <div className="evidence-inline">
            {stage.evidence.map((item) => <span key={item}><FileText />{item}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function StageProgressTable({ stages }: { stages: readonly ZhixuStageDTO[] }) {
  return (
    <div className="progress-table">
      <div className="progress-head">
        <span>阶段</span>
        <span>状态</span>
        <span>负责人</span>
        <span>更新时间</span>
      </div>
      {stages.map((stage) => (
        <div className="progress-row" key={stage.name}>
          <div><span className="stage-index small">{stage.index}</span><strong>{stage.name}</strong></div>
          <StageStatus status={stage.status} />
          <span>{stage.ownerRole}</span>
          <span>{stage.updatedAt ?? "-"}</span>
        </div>
      ))}
    </div>
  );
}

function StageStatus({ status }: { status: StageStatus }) {
  if (status === "done") {
    return <span className="status-pill ok"><CheckCircle2 /> 已完成</span>;
  }
  if (status === "active") {
    return <span className="status-pill active"><Clock3 /> 进行中</span>;
  }
  return <span className="status-pill muted"><Circle /> 未开始</span>;
}

function ProofPanel({
  open,
  onToggle,
  compactText,
  proofRows
}: {
  open: boolean;
  onToggle: () => void;
  compactText: string;
  proofRows: readonly ChainProofRowDTO[];
}) {
  return (
    <section className="proof-panel">
      <button className="proof-toggle" onClick={onToggle}>
        <span><ShieldCheck /> 高级链上证明</span>
        <small>{compactText}</small>
        <ChevronDown className={open ? "rotate" : ""} />
      </button>
      {open ? (
        <div className="proof-details">
          {proofRows.map((row) => <MoneyRow key={row.label} label={row.label} value={row.value} />)}
        </div>
      ) : null}
    </section>
  );
}

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="step-bar">
      {steps.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <div className={`step-item ${done ? "is-done" : ""} ${active ? "is-active" : ""}`} key={step}>
            <span>{done ? <Check /> : number}</span>
            <strong>{step}</strong>
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  value,
  required,
  suffix,
  placeholder,
  icon
}: {
  label: string;
  value?: string | undefined;
  required?: boolean | undefined;
  suffix?: string | undefined;
  placeholder?: string | undefined;
  icon?: ReactNode | undefined;
}) {
  return (
    <label className="field">
      <span>{label}{required ? <em>*</em> : null}</span>
      <div className="input-wrap">
        <input defaultValue={value} placeholder={placeholder} />
        {suffix ? <b>{suffix}</b> : null}
        {icon ? <i>{icon}</i> : null}
      </div>
    </label>
  );
}

function SelectField({ label, value, required }: { label: string; value: string; required?: boolean | undefined }) {
  return (
    <label className="field">
      <span>{label}{required ? <em>*</em> : null}</span>
      <div className="input-wrap">
        <input defaultValue={value} />
        <i><ChevronDown /></i>
      </div>
    </label>
  );
}

function Textarea({ label, value, placeholder, required }: { label: string; value?: string | undefined; placeholder?: string | undefined; required?: boolean | undefined }) {
  return (
    <label className="field span-2">
      <span>{label}{required ? <em>*</em> : null}</span>
      <textarea defaultValue={value} placeholder={placeholder} />
    </label>
  );
}

function ChoiceGroup({ label, options, active }: { label: string; options: string[]; active: string }) {
  return (
    <div className="field span-2">
      <span>{label}<em>*</em></span>
      <div className="choice-row">
        {options.map((option) => (
          <button className={`choice-button ${option === active ? "is-active" : ""}`} key={option}>
            <Circle /> {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Panel({ children, tone }: { children: ReactNode; tone?: "success" | "muted" | undefined }) {
  return <section className={`panel-card ${tone ? `panel-${tone}` : ""}`}>{children}</section>;
}

function SidePanel({ title, children, action }: { title: string; children: ReactNode; action?: string | undefined }) {
  return (
    <section className="side-panel">
      <div className="side-panel-title">
        <h3>{title}</h3>
        {action ? <button>{action}</button> : null}
      </div>
      {children}
    </section>
  );
}

function BackLine({ children, onClick }: { children: ReactNode; onClick?: (() => void) | undefined }) {
  return <button className="back-line" onClick={onClick}><ChevronLeft /> {children}</button>;
}

function StatusBadge({ children, icon, tone = "default" }: { children: ReactNode; icon?: ReactNode | undefined; tone?: "success" | "warning" | "info" | "default" | undefined }) {
  return <span className={`status-badge ${tone}`}>{icon}{children}</span>;
}

function participantTaskStatusLabel(status: ProductTaskDTO["status"]): string {
  switch (status) {
    case "open":
      return "待处理";
    case "submitted":
      return "已提交";
    case "done":
      return "已完成";
    case "blocked":
      return "已阻塞";
  }
}

function pluginKindLabel(kind: FulfillmentPluginKind | undefined): string {
  switch (kind) {
    case "payment_placeholder":
      return "稳定币/外部资金占位";
    case "evidence_submission":
      return "阶段凭证提交";
    case "delivery_update":
      return "交付进度更新";
    case "validation_confirm":
      return "验收确认";
    case "dispute_material":
      return "争议材料提交";
    default:
      return "阶段待办";
  }
}

function NoticeCard({ icon, title, tone }: { icon: ReactNode; title: string; tone: "success" | "warning" }) {
  return <div className={`notice-card ${tone}`}>{icon}<strong>{title}</strong></div>;
}

function SideMetric({ icon, label, value, tone }: { icon?: ReactNode | undefined; label: string; value: ReactNode; tone?: "success" | undefined }) {
  return (
    <div className="side-metric">
      {icon ? <span className={tone ?? ""}>{icon}</span> : null}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon?: ReactNode | undefined; tone?: "success" | undefined }) {
  return (
    <div className="kpi-card">
      <span>{label}</span>
      <strong className={tone ?? ""}>{icon}{value}</strong>
    </div>
  );
}

function SummaryItem({ icon, label, title, tone }: { icon: ReactNode; label?: string | undefined; title: string; tone?: "success" | undefined }) {
  return (
    <div className={`summary-item ${tone ?? ""}`}>
      {icon}
      <div>
        {label ? <span>{label}</span> : null}
        <strong>{title}</strong>
      </div>
    </div>
  );
}

function BottomActions({ children }: { children: ReactNode }) {
  return <footer className="bottom-actions">{children}</footer>;
}

function Condition({ status, title, desc }: { status: "done" | "warn"; title: string; desc: string }) {
  return (
    <div className={`condition ${status}`}>
      {status === "done" ? <CheckCircle2 /> : <AlertTriangle />}
      <div><strong>{title}</strong><p>{desc}</p></div>
    </div>
  );
}

function StatusText({ children, tone }: { children: ReactNode; tone: ProductTone }) {
  return <span className={`status-text ${tone}`}>{children}</span>;
}

function ParticipantStatus({ text, active }: { text: string; active?: boolean }) {
  return <div className={`participant-status ${active ? "is-active" : ""}`}><User /> <span>{text}</span></div>;
}

function MoneyRow({ label, value, success, danger }: { label: string; value: ReactNode; success?: boolean; danger?: boolean }) {
  return <div className={`money-row ${success ? "success" : ""} ${danger ? "danger" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function EventLine({ text, time }: { text: string; time: string }) {
  return <div className="event-line"><CheckCircle2 /> <span>{text}</span><time>{time}</time></div>;
}

function MiniTask({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button className="quick-order-card" onClick={onClick}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </button>
  );
}

function CheckStatement({ title, desc }: { title: string; desc: string }) {
  return <div className="check-statement"><CheckCircle2 /><div><strong>{title}</strong><p>{desc}</p></div></div>;
}

function FactRow({ icon, label, value, danger }: { icon: ReactNode; label: string; value: string; danger?: boolean }) {
  return <div className={`fact-row ${danger ? "danger" : ""}`}>{icon}<span>{label}</span><strong>{value}</strong></div>;
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function draftStatusLabel(status: ProductOrderDraftDTO["status"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "awaiting_participants":
      return "等待参与方";
    case "ready_to_trigger":
      return "可启动";
    case "triggering":
      return "启动中";
    case "triggered":
      return "已启动";
    case "failed":
      return "启动失败";
    case "cancelled":
      return "已取消";
  }
}

function draftParticipantStatusLabel(status: DraftParticipantDTO["status"]): string {
  switch (status) {
    case "missing":
      return "待邀请";
    case "invited":
      return "已邀请";
    case "accepted":
      return "已接受";
    case "rejected":
      return "已拒绝";
    case "replaced":
      return "已替换";
  }
}

function draftParticipantActionLabel(status: DraftParticipantDTO["status"]): string {
  switch (status) {
    case "missing":
      return "发送邀请";
    case "invited":
      return "重新发送";
    case "accepted":
      return "发送提醒";
    case "rejected":
    case "replaced":
      return "重新邀请";
  }
}

function draftParticipantTone(status: DraftParticipantDTO["status"]): ProductTone {
  switch (status) {
    case "accepted":
      return "ok";
    case "invited":
      return "info";
    case "missing":
    case "rejected":
    case "replaced":
      return "warn";
  }
}

function submitStatusLabel(status: SubmitMachineStatus): string {
  switch (status) {
    case "idle":
      return "等待提交";
    case "preparing":
      return "准备中";
    case "wallet_not_connected":
      return "未连接钱包";
    case "wallet_rejected":
      return "钱包已取消";
    case "signature_pending":
      return "等待钱包授权";
    case "tx_pending":
      return "提交处理中";
    case "confirmed":
      return "已确认";
    case "failed":
      return "提交失败";
  }
}

function submitStatusTitle(status: SubmitMachineStatus): string {
  switch (status) {
    case "idle":
      return "等待提交";
    case "preparing":
      return "正在准备提交";
    case "wallet_not_connected":
      return "请连接钱包";
    case "wallet_rejected":
      return "你已取消授权";
    case "signature_pending":
      return "等待钱包授权";
    case "tx_pending":
      return "提交处理中";
    case "confirmed":
      return "已确认报关完成";
    case "failed":
      return "提交失败";
  }
}

function roleSlotIcon(slotId: string): ReactNode {
  switch (slotId) {
    case "funds":
      return <HandCoins />;
    case "supply":
      return <Building2 />;
    case "delivery":
      return <Truck />;
    case "validation":
      return <ShieldCheck />;
    case "dispute":
      return <ClipboardCheck />;
    case "maintainer":
      return <UserCheck />;
    default:
      return <PackageCheck />;
  }
}

function dockableModuleIcon(moduleId: string): ReactNode {
  switch (moduleId) {
    case "funds-protection":
      return <WalletCards />;
    case "logistics-delivery":
      return <Truck />;
    case "inspection-acceptance":
      return <ShieldCheck />;
    case "dispute-resolution":
      return <ClipboardCheck />;
    default:
      return <Layers3 />;
  }
}

function roleSlotStatusLabel(status: RoleSlotStatus): string {
  switch (status) {
    case "required":
      return "必须参与";
    case "connected":
      return "已确认";
    case "optional":
      return "可选参与";
  }
}

function dockableModuleStatusLabel(status: DockableModuleStatus): string {
  switch (status) {
    case "connected":
      return "已接入";
    case "available":
      return "可接入";
    case "planned":
      return "规划中";
  }
}

function participantStatusLabel(status: ParticipantStatus): string {
  switch (status) {
    case "joined":
      return "已加入";
    case "invited":
      return "待邀请";
    case "pending_confirmation":
      return "待确认";
    case "assigned":
      return "已指定";
    case "not_started":
      return "未开始";
  }
}

function currentAssignee(order: ProductOrderDTO): string {
  return order.participants.find((participant) => participant.participantId === "customs")?.role ?? "待确认执行方";
}

function diagEndpointKey(endpoint: string): string {
  return endpoint.replace(/^\/+/, "").replace(/\//g, "-");
}
