// 订单总览页：原 ProductWorkbenchApp.tsx 的 OrderOverviewPage 及其专属的阶段进度表、
// KPI、参与方状态与事件行（纯搬迁）。
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock3,
  Layers3,
  RefreshCw,
  Send,
  ShieldCheck,
  User
} from "lucide-react";
import type { ReactNode } from "react";
import type { ParticipantStatus, ProductOrderDTO, StageStatus, ZhixuStageDTO } from "@uvp-eth/product-dto";
import {
  BackLine,
  MoneyRow,
  Panel,
  ProofPanel,
  SidePanel,
  StatePanel,
  StatusBadge
} from "../workbench/WorkbenchWidgets";

export function OrderOverviewPage({
  order,
  syncing,
  awaitingNewOrderProjection,
  onBack,
  onTask,
  onDispute,
  proofOpen,
  setProofOpen
}: {
  order: ProductOrderDTO;
  syncing: boolean;
  /** 新订单已启动但投影未落地：当前页面展示的是旧订单，需明确区分两种状态。 */
  awaitingNewOrderProjection: boolean;
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
      {awaitingNewOrderProjection ? (
        <div className="warning-box" data-testid="order-awaiting-new-order" role="alert">
          <AlertTriangle />
          <div>
            <strong>新订单已启动，正在等待链上投影落地</strong>
            <p>新订单的总览尚未就绪；下方内容是之前的订单「{order.title}」，不代表新订单的状态。请勿重复启动，稍后刷新即可查看新订单。</p>
          </div>
        </div>
      ) : null}
      {syncing ? <StatePanel icon={<RefreshCw className="spin" />} title="订单状态同步中" desc="提交已发出，订单页正在等待后端投影更新。" tone="info" /> : null}
      <div className="order-kpis">
        <Kpi label="总金额" value={order.totalAmount.display} />
        <Kpi label="资金状态" value={fundingStatusDisplay(order.fundingStatus)} icon={<AlertTriangle />} />
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
              <ParticipantStatus key={item.participantId} active={item.participantId === firstJoinedParticipantId(order)} text={`${item.role} ${participantStatusLabel(item.status)}`} />
            ))}
          </SidePanel>
          <SidePanel title="资金信息">
            <MoneyRow label="订单金额" value={order.totalAmount.display} />
            <MoneyRow label="资金状态" value={fundingStatusDisplay(order.fundingStatus)} />
            <span className="text-button as-label">资金状态来自订单 DTO；未接入时不会显示为已保障。</span>
          </SidePanel>
          <SidePanel title="最近事件" action="查看全部">
            {order.recentEvents.map((event) => <EventLine key={event.eventId} text={event.text} time={event.time} />)}
          </SidePanel>
        </aside>
      </div>
    </section>
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

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon?: ReactNode | undefined; tone?: "success" | undefined }) {
  return (
    <div className="kpi-card">
      <span>{label}</span>
      <strong className={tone ?? ""}>{icon}{value}</strong>
    </div>
  );
}

function fundingStatusDisplay(value: string): string {
  return value.trim() || "未接入";
}

function ParticipantStatus({ text, active }: { text: string; active?: boolean }) {
  return <div className={`participant-status ${active ? "is-active" : ""}`}><User /> <span>{text}</span></div>;
}

function EventLine({ text, time }: { text: string; time: string }) {
  return <div className="event-line"><CheckCircle2 /> <span>{text}</span><time>{time}</time></div>;
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
  const joined = order.participants.find((participant) => participant.status === "joined");
  return joined?.role ?? order.participants[0]?.role ?? "待确认执行方";
}

function firstJoinedParticipantId(order: ProductOrderDTO): string | undefined {
  return order.participants.find((participant) => participant.status === "joined")?.participantId;
}
