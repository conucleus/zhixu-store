// 参与者侧秩序库视图：工作台首页、秩序目录与秩序详情（原 ProductWorkbenchApp.tsx，纯搬迁）。
// 秩序选择/切换、角色停靠图、可扩展模块与阶段列表随视图同迁。
import {
  AlertTriangle,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  HandCoins,
  HelpCircle,
  Layers3,
  PackageCheck,
  Search,
  ShieldCheck,
  UserCheck,
  WalletCards
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  DockableModuleStatus,
  DockableZhixuModuleDTO,
  FulfillmentPluginKind,
  ProductOrderDTO,
  ProductTaskDTO,
  RoleSlotDTO,
  RoleSlotStatus,
  ZhixuDetailDTO,
  ZhixuStageDTO
} from "@uvp-eth/product-dto";
import type { ProductWorkbenchData } from "../api";
import { canCreateProductOrder } from "./workbenchSupport";
import {
  BackLine,
  InlineEmpty,
  NoticeCard,
  Panel,
  ProofPanel,
  SideMetric,
  SidePanel,
  StatusBadge,
  StatusText
} from "./WorkbenchWidgets";

export function ParticipantAppPage({
  data,
  selectedZhixuId,
  onSelectZhixu,
  onCatalog,
  onViewDetail,
  onCreate,
  onOrder,
  onTask
}: {
  data: ProductWorkbenchData;
  /** 当前选中的秩序（多秩序目录可切换）；未选中时回退投影的 activeTask。 */
  selectedZhixuId?: string | undefined;
  onSelectZhixu: (zhixuId: string) => void;
  onCatalog: () => void;
  onViewDetail: () => void;
  onCreate: () => void;
  onOrder: () => void;
  onTask: (taskId: string) => void;
}) {
  const openTasks = data.tasks.filter((task) => task.status === "open");
  const blockedTasks = data.tasks.filter((task) => task.status === "blocked");
  // submitted 是"等待链上确认"的中间态，与 done 并列"最近完成"会提前宣布成功。
  const completedTasks = data.tasks.filter((task) => task.status === "done");
  const primaryTask = openTasks[0] ?? data.activeTask;
  const zhixu = data.zhixus.find((item) => item.zhixuId === selectedZhixuId) ?? data.zhixu;
  const canCreate = zhixu ? canCreateProductOrder(zhixu) : false;

  return (
    <section className="page-shell" data-testid="participant-app-page">
      <div className="hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">普通履约者 App</span>
          <h1>我的待办</h1>
          <p>所有参与方都在这里处理自己被分配的任务。不同角色看到不同任务插件，但提交后都会留下可核对证明。</p>
          <div className="hero-actions">
            {primaryTask ? <button className="primary-button" data-testid="participant-primary-task-button" onClick={() => onTask(primaryTask.taskId)}><ClipboardCheck /> 处理当前待办</button> : null}
            {data.order ? <button className="secondary-button" data-testid="participant-order-room-button" onClick={onOrder}><FileText /> 打开订单房间</button> : null}
          </div>
        </div>
        <div className="hero-side">
          <SideMetric icon={<UserCheck />} label="当前身份" value={data.participant?.displayName ?? "身份未确认"} />
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
                <p>{data.participant && data.participant.roleLabels.length > 0 ? `当前角色：${data.participant.roleLabels.join("、")}` : "身份未确认：连接钱包或接受邀请后，只展示你能处理的任务。"}</p>
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
                      <StatusBadge tone={participantTaskStatusTone(task.status)}>{participantTaskStatusLabel(task.status)}</StatusBadge>
                    </div>
                    <div className="catalog-facts">
                      <FactRow icon={<Layers3 />} label="任务插件" value={pluginKindLabel(task.capabilityPlugin?.pluginKind)} />
                      <FactRow icon={<FileCheck2 />} label="需要凭证" value={(task.evidenceSpec ?? []).map((slot) => slot.label).join("、") || "按业务约定提交凭证"} />
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
                    <button
                      className={task.status === "open" ? "primary-button block" : "secondary-button block"}
                      data-testid={`participant-task-open-${task.taskId}`}
                      onClick={() => onTask(task.taskId)}
                      disabled={task.status === "blocked"}
                    >{task.status === "open" ? "进入处理" : "查看详情"}</button>
                  </div>
                </article>
              )) : <InlineEmpty text="当前钱包暂无待办" />}
            </div>
          </Panel>
        </div>

        <aside className="right-stack">
          <SidePanel title="推荐秩序">
            <ZhixuSwitcher zhixus={data.zhixus} selectedZhixuId={zhixu?.zhixuId} onSelect={onSelectZhixu} />
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
              <MiniTask key={task.taskId} title={task.title} detail={task.proofSummary?.label ?? "已完成"} onClick={onOrder} />
            )) : <InlineEmpty text="暂无已完成待办" />}
          </SidePanel>
        </aside>
      </div>
    </section>
  );
}


export function CatalogPage({
  zhixu,
  zhixus,
  onSelectZhixu,
  order,
  task,
  onViewDetail,
  onCreate,
  onOrder,
  onTask
}: {
  zhixu: ZhixuDetailDTO;
  /** 目录内全部可选秩序：多条时渲染切换入口，不再只渲染第一条。 */
  zhixus: readonly ZhixuDetailDTO[];
  onSelectZhixu: (zhixuId: string) => void;
  order?: ProductOrderDTO | undefined;
  task?: ProductTaskDTO | undefined;
  onViewDetail: () => void;
  onCreate: () => void;
  onOrder: () => void;
  onTask: (taskId: string) => void;
}) {
  const canCreate = canCreateProductOrder(zhixu);
  const catalogFilters = [...new Set(["全部", ...zhixu.applicableBusiness])];
  const roleSummary = zhixu.roleSlots.slice(0, 3).map((slot) => slot.title).join("、") || "各参与角色";
  return (
    <section className="page-shell" data-testid="catalog-page">
      <section className="store-hero">
        <div>
          <StatusBadge icon={<ShieldCheck />} tone="success">共同秩序审核</StatusBadge>
          <h1>把秩序拆成每个人看得懂的待办</h1>
          <p>选择已发布的秩序，邀请 {roleSummary} 按同一套规则协作。每次确认都会留下可核对的证明，方便后续处理与复核。</p>
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
          <input placeholder="搜索业务、角色或凭证" />
        </label>
        <div className="catalog-filter-row">
          {catalogFilters.map((item, index) => (
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
            <ZhixuSwitcher zhixus={zhixus} selectedZhixuId={zhixu.zhixuId} onSelect={onSelectZhixu} />
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
              <button className="quick-order-card" data-testid="catalog-task-card" onClick={() => onTask(task.taskId)}>
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
              <p>创建订单、提交凭证、确认责任都在这个工作台完成。高级证明只在需要核对时展开。</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}


export function ZhixuDetailPage({
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
  const canCreate = canCreateProductOrder(zhixu);
  return (
    <section className="page-shell" data-testid="zhixu-detail-page">
      <BackLine onClick={onBack}>返回秩序库</BackLine>
      <div className="page-title-row">
        <div>
          <h1>{zhixu.title}</h1>
          <p>{zhixu.subtitle}</p>
        </div>
        <StatusBadge icon={<ShieldCheck />} tone={canCreate ? "success" : "warning"}>{zhixu.reviewLabel}</StatusBadge>
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
                <p>可按秩序配置接入协作模块；模块状态以当前秩序数据为准。</p>
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


/**
 * 目录多秩序切换入口：目录里只有一条秩序时没有切换语义（不渲染）；
 * 多条时如实列出全部可选项，不让"第一条"静默充当唯一选择。
 */
function ZhixuSwitcher({
  zhixus,
  selectedZhixuId,
  onSelect
}: {
  zhixus: readonly ZhixuDetailDTO[];
  selectedZhixuId?: string | undefined;
  onSelect: (zhixuId: string) => void;
}) {
  if (zhixus.length <= 1) {
    return null;
  }
  return (
    <div className="catalog-filter-row" data-testid="zhixu-switcher">
      {zhixus.map((zhixu) => (
        <button
          className={`filter-chip ${zhixu.zhixuId === selectedZhixuId ? "is-active" : ""}`}
          key={zhixu.zhixuId}
          onClick={() => onSelect(zhixu.zhixuId)}
        >
          {zhixu.title}
        </button>
      ))}
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
              <span className="role-slot-icon"><PackageCheck /></span>
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
        <article className="dock-module-card" key={module.interfaceName}>
          <div className="dock-module-title">
            <span><Layers3 /></span>
            <div>
              <strong>{module.title}</strong>
              <p>{module.desc}</p>
            </div>
            <StatusBadge tone={module.status === "connected" ? "success" : module.status === "planned" ? "info" : "default"}>
              {dockableModuleStatusLabel(module.status)}
            </StatusBadge>
          </div>
          <div className="dock-port-row">
            {module.inputs.map((port) => (
              <span key={`in:${port.portName}`}>入口 {port.label}</span>
            ))}
            {module.outputs.map((port) => (
              <span key={`out:${port.portName}`}>出口 {port.label}</span>
            ))}
          </div>
          <div className="dock-port-row">
            <span>下单模式：{module.orderModes.join(" / ")}</span>
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

function participantTaskStatusTone(status: ProductTaskDTO["status"]): "info" | "warning" | "success" {
  switch (status) {
    case "open":
      return "info";
    case "blocked":
      return "warning";
    // submitted 是等待链上确认的中间态：标签如实说"已提交"，色调不得提前用成功色宣布完成。
    case "submitted":
      return "info";
    case "done":
      return "success";
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

function MiniTask({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button className="quick-order-card" onClick={onClick}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </button>
  );
}

function FactRow({ icon, label, value, danger }: { icon: ReactNode; label: string; value: string; danger?: boolean }) {
  return <div className={`fact-row ${danger ? "danger" : ""}`}>{icon}<span>{label}</span><strong>{value}</strong></div>;
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
