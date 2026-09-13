// 参与方确认与订单启动页：原 ProductWorkbenchApp.tsx 的 ParticipantsPage（纯搬迁）。
// 启动动作由 workbench 的 useOrderRegistrationFlow（钱包 EIP-712 签名）承接，本页只做渲染。
import { AlertTriangle, CheckCircle2, Copy, FileText, HandCoins, Loader2, LockKeyhole, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import type { ProductOrderDTO, ProductTone } from "@uvp-eth/product-dto";
import type { DraftParticipantDTO, ProductInviteDTO, ProductOrderDraftDTO } from "../api";
import { idleAction, type ActionState } from "../workbench/workbenchTypes";
import { inviteLinkForInvite, resolveOrderAppInviteBaseUrl } from "../workbench/workbenchSupport";
import { draftStatusLabel } from "../order/draftStatusLabel";
import {
  ActionNotice,
  BackLine,
  EmptyState,
  Panel,
  StatusText,
  SummaryItem
} from "../workbench/WorkbenchWidgets";

export function ParticipantsPage({
  order,
  draft,
  draftParticipants,
  draftParticipantsStatus,
  draftParticipantsError,
  inviteActions,
  registerAction,
  onBack,
  onInvite,
  onRegister,
  onOrder,
  onReloadParticipants
}: {
  order?: ProductOrderDTO | undefined;
  draft?: ProductOrderDraftDTO | undefined;
  draftParticipants: readonly DraftParticipantDTO[];
  draftParticipantsStatus: "unknown" | "loading" | "ready" | "error";
  draftParticipantsError?: string | undefined;
  inviteActions: Readonly<Record<string, ActionState & {
    readonly invite?: ProductInviteDTO | undefined;
    readonly inviteToken?: string | undefined;
  }>>;
  registerAction: ActionState;
  onBack: () => void;
  onInvite: (participant: DraftParticipantDTO) => void;
  onRegister: () => void;
  onOrder: () => void;
  onReloadParticipants: () => void;
}) {
  if (!draft) {
    return (
      <section className="page-shell">
        <BackLine onClick={onBack}>返回订单信息</BackLine>
        <EmptyState title="请先创建订单草稿" desc="创建草稿后，系统会生成参与方清单和邀请链接。" />
      </section>
    );
  }
  const requiredParticipants = draftParticipants.filter((item) => item.required);
  // Empty/unknown participant data is not proof that all required parties
  // agreed. Require a successful, non-empty response and explicit acceptance.
  const requiredReady = draftParticipantsStatus === "ready" &&
    requiredParticipants.length > 0 &&
    requiredParticipants.every((item) => item.status === "accepted");
  // 邀请链接基地址是配置级判定（所有行共用）：缺 VITE_UVP_ORDER_APP_URL 时
  // fail-closed 不生成死链，改为显式提示（不阻断发邀请本身）。
  let inviteLinkBaseError: string | undefined;
  try {
    resolveOrderAppInviteBaseUrl();
  } catch (error) {
    inviteLinkBaseError = error instanceof Error ? error.message : "邀请链接基地址未配置";
  }
  const hasIssuedInvites = draftParticipants.some((item) => {
    const action = inviteActions[item.participantId];
    return Boolean(action?.invite && action.inviteToken);
  });
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
          {draftParticipantsStatus === "loading" ? <div className="inline-empty">正在加载参与方清单…</div> : null}
          {draftParticipantsStatus === "error" ? (
            <div className="warning-box" role="alert" data-testid="participants-load-error">
              <AlertTriangle />
              <div>
                <strong>参与方清单加载失败</strong>
                <p>{draftParticipantsError ?? "无法确认参与方状态，请稍后重试。"}</p>
              </div>
              <button className="secondary-button" data-testid="participants-retry-button" onClick={onReloadParticipants}>
                <RefreshCw /> 重试加载
              </button>
            </div>
          ) : null}
          {draftParticipantsStatus === "ready" && draftParticipants.length === 0 ? (
            <div className="warning-box" role="alert" data-testid="participants-empty-state">
              <AlertTriangle />
              <div>
                <strong>参与方清单为空</strong>
                <p>尚未收到任何参与方记录，无法确认启动条件。</p>
              </div>
            </div>
          ) : null}
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
              // 一次性令牌由服务端在创建响应下发：没有 token 的邀请链接在
              // 对端 accept/reject（token 哈希比对）处必然 403，不成链。
              // 基地址缺配置时同样不产出链接（死链外泄一次性令牌）。
              const inviteLink = !inviteLinkBaseError && action?.invite && action.inviteToken
                ? inviteLinkForInvite(action.invite.inviteId, action.inviteToken)
                : undefined;
              return (
              <div className="participant-row" data-testid="participant-row" data-uvp-participant-required={item.required ? "true" : "false"} data-uvp-participant-status={item.status} key={item.participantId}>
                <div className="participant-role">
                  <span className="role-icon"><PackageCheck /></span>
                  <strong>{item.roleLabel}</strong>
                </div>
                <p data-testid={`participant-contact-${item.participantId}`}>{item.required ? "关键参与方，需要确认职责" : "可选参与方，可稍后邀请"}；联系方式：{item.contact.trim() ? item.contact.trim() : "未填写"}</p>
                <div className="evidence-list"><span><FileText />职责确认</span></div>
                <StatusText tone={draftParticipantTone(item.status)}>{draftParticipantStatusLabel(item.status)}</StatusText>
                <div className="row-actions">
                  <button
                    className={item.status === "missing" ? "primary-mini" : "light-button"}
                    onClick={() => onInvite(item)}
                    disabled={actionState.phase === "pending" || !item.contact.trim()}
                  >
                    {actionState.phase === "pending" ? <Loader2 className="spin" /> : null}{draftParticipantActionLabel(item.status)}
                  </button>
                  {inviteLink
                    ? <button className="light-button" onClick={() => void navigator.clipboard?.writeText(inviteLink)}><Copy /> 复制链接</button>
                    : action?.invite && action.inviteToken
                      ? <button className="light-button" disabled title={inviteLinkBaseError}><Copy /> 复制链接（未配置）</button>
                      : <button className="light-button" onClick={() => onInvite(item)} disabled={!item.contact.trim()}>替换</button>}
                </div>
                <ActionNotice state={actionState} compact />
              </div>
            );})}
          </div>
          {inviteLinkBaseError && hasIssuedInvites ? (
            <div className="warning-box" role="alert" data-testid="invite-link-config-error">
              <AlertTriangle />
              <div>
                <strong>邀请链接不可用：未配置 uvp-order-app 部署地址</strong>
                <p>{inviteLinkBaseError}。一次性令牌已由服务端签发但无法拼出入站链接；补配该变量并重新构建后，重新发送邀请即可获得可复制链接。</p>
              </div>
            </div>
          ) : null}
          <button className={requiredReady ? "primary-button block" : "disabled-button block"} data-testid="register-order-button" onClick={requiredReady ? onRegister : undefined} disabled={!requiredReady || registerAction.phase === "pending"}>
            {registerAction.phase === "pending" ? <Loader2 className="spin" /> : <LockKeyhole />} 全部关键方确认后启动订单
          </button>
          <p className="center-note">仅当参与方清单已成功加载且所有关键参与方满足条件后，启动按钮才会可用。</p>
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


function Condition({ status, title, desc }: { status: "done" | "warn"; title: string; desc: string }) {
  return (
    <div className={`condition ${status}`}>
      {status === "done" ? <CheckCircle2 /> : <AlertTriangle />}
      <div><strong>{title}</strong><p>{desc}</p></div>
    </div>
  );
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
