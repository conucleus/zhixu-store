import { BadgeCheck, ClipboardList, Loader2, ShieldAlert, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import type {
  StoreAccessState,
  StoreApiResult,
  StoreJoinApplicationDetailView,
  StoreJoinApplicationStatus
} from "./types";
import { shortValue } from "../shared/frontend";

type JoinListState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly applications: readonly StoreJoinApplicationDetailView[]; readonly scope: "viewer" | "plan" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "unauthenticated" };

const JOIN_STATUS_LABELS: Record<StoreJoinApplicationStatus, string> = {
  applied: "已申请",
  under_review: "审核中",
  authorized: "已授权（链上证据已记录）",
  active: "已生效（链上授权已落地）",
  rejected: "已拒绝",
  revoked: "已撤销"
};

/**
 * 加入闭环页：供应商看"我的申请"，publisher（或受托成员）按 plan
 * 看审核队列。通过审批即执行身份配对并记录链上交易证据。
 */
export function StoreJoinPage({
  access,
  api,
  planIdFilter,
  zhixuFilter,
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly planIdFilter?: string | undefined;
  /** plan 过滤视图对应的 zhixuId：用于向服务端查询当前会话的审核能力。 */
  readonly zhixuFilter?: string | undefined;
}) {
  const [state, setState] = useState<JoinListState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | undefined>();
  // 已排队待执行的治理动作所在行：治理动作不允许被静默丢弃，其他行 busy 时入队串行执行。
  const [queuedIds, setQueuedIds] = useState<readonly string[]>([]);
  const actionQueueRef = useRef<readonly (() => Promise<void>)[]>([]);
  const drainingRef = useRef(false);
  const [message, setMessage] = useState<string | undefined>();
  const [rejectTarget, setRejectTarget] = useState<string | undefined>();
  const [rejectReason, setRejectReason] = useState("");
  // 服务端声明的审核能力（publisher 或受托成员）；未查询到即视为无能力（fail-closed）。
  const [viewerMayReviewPlan, setViewerMayReviewPlan] = useState(false);

  const anchored = access.anchoredAddress;

  useEffect(() => {
    setViewerMayReviewPlan(false);
    if (!planIdFilter || !zhixuFilter) {
      return;
    }
    let cancelled = false;
    void api.getZhixuDetailWithOverlay(zhixuFilter).then((result) => {
      if (cancelled) {
        return;
      }
      const permission = result.data.overlay?.viewerPermission;
      setViewerMayReviewPlan(
        permission !== undefined &&
        (permission.viewerIsPublisher || permission.viewerActiveDelegations.length > 0),
      );
    }).catch(() => {
      // 叠加层不可得时按无审核能力渲染，不猜服务端权限。
      if (!cancelled) {
        setViewerMayReviewPlan(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, planIdFilter, zhixuFilter]);

  const reload = useCallback(async () => {
    if (!anchored) {
      setState({ status: "unauthenticated" });
      return;
    }
    setState({ status: "loading" });
    try {
      const result = await api.listJoinApplications({
        ...(planIdFilter ? { planId: planIdFilter } : {}),
      });
      setState({
        status: "ready",
        applications: result.data.applications,
        scope: planIdFilter ? "plan" : "viewer"
      });
    } catch (error) {
      setState({ status: "error", message: readableStoreError(error, "申请列表加载失败") });
    }
  }, [api, anchored, planIdFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 治理动作串行队列：其他行 busy 时入队而非丢弃，队列按提交顺序逐个执行。 */
  function enqueueAction(action: () => Promise<void>): void {
    actionQueueRef.current = [...actionQueueRef.current, action];
    if (drainingRef.current) {
      return;
    }
    drainingRef.current = true;
    void (async () => {
      try {
        while (actionQueueRef.current.length > 0) {
          const next = actionQueueRef.current[0];
          if (!next) {
            break;
          }
          actionQueueRef.current = actionQueueRef.current.slice(1);
          await next();
        }
      } finally {
        drainingRef.current = false;
      }
    })();
  }

  function run(
    applicationId: string,
    action: () => Promise<unknown>,
    done: string | ((result: unknown) => string)
  ): void {
    setQueuedIds((current) => [...current, applicationId]);
    enqueueAction(async () => {
      setQueuedIds((current) => current.filter((id) => id !== applicationId));
      setBusyId(applicationId);
      setMessage(undefined);
      try {
        const result = await action();
        setMessage(typeof done === "function" ? done(result) : done);
        await reload();
      } catch (error) {
        setMessage(readableStoreError(error, "操作失败"));
      } finally {
        setBusyId(undefined);
      }
    });
  }

  const isOperator = access.level === "store_operator" || access.level === "store_admin";
  // 审核操作位按服务端能力渲染：运营方能力，或服务端叠加层声明当前会话是
  // publisher/受托成员。任意已锚定会话不再默认获得写入口（点下去只会得到 403）。
  const viewerCanReview = isOperator || (Boolean(planIdFilter) && viewerMayReviewPlan);

  return (
    <section className="store-join-page" data-testid="store-join-page">
      <header className="store-panel-head">
        <h2><UserPlus /> 加入申请</h2>
        <p>
          {planIdFilter
            ? "该秩序的加入申请审核队列（publisher 或受托成员可操作：开始审核 → 通过 → 链上身份配对）。"
            : "我的加入申请：申请 → 凝结核审核 → 链上授权（记录交易证据）→ 收到工作台待办后生效。"}
        </p>
      </header>

      {message ? <p className="store-account-message" data-testid="store-join-message">{message}</p> : null}
      {state.status === "unauthenticated" ? (
        <p className="store-account-warn" data-testid="store-join-unauthenticated">
          <ShieldAlert /> 加入闭环要求会话已锚定钱包地址。请先在「账号与地址」页连接钱包登录。
        </p>
      ) : null}
      {state.status === "loading" ? <p className="muted"><Loader2 className="spin" /> 正在读取申请…</p> : null}
      {state.status === "error" ? <p className="store-account-message is-error">{state.message}</p> : null}

      {state.status === "ready" ? (
        state.applications.length === 0 ? (
          <p className="muted">暂无申请。在秩序详情页选择角色槽位即可发起加入申请。</p>
        ) : (
          <table className="store-data-table" data-testid="store-join-table">
            <thead>
              <tr>
                <th>申请</th>
                <th>角色槽位 / 授权类型</th>
                <th>申请人</th>
                <th>状态</th>
                <th>链上证据</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {state.applications.map((detail) => (
                <JoinApplicationRow
                  key={detail.application.applicationId}
                  detail={detail}
                  busy={busyId === detail.application.applicationId}
                  queued={queuedIds.includes(detail.application.applicationId)}
                  isOperator={isOperator}
                  viewerCanReview={viewerCanReview}
                  rejectOpen={rejectTarget === detail.application.applicationId}
                  rejectReason={rejectReason}
                  onRejectReasonChange={setRejectReason}
                  onReviewStart={() => run(detail.application.applicationId, () => api.joinReviewStart(detail.application.applicationId), "已开始审核")}
                  onApprove={() => run(detail.application.applicationId, () => api.joinApprove(detail.application.applicationId), joinApproveMessage)}
                  onRejectOpen={() => {
                    setRejectTarget(detail.application.applicationId);
                    setRejectReason("");
                  }}
                  onRejectCancel={() => setRejectTarget(undefined)}
                  onRejectSubmit={() => {
                    const reason = rejectReason.trim();
                    if (reason.length === 0) {
                      setMessage("拒绝必须填写理由（留痕红线）");
                      return;
                    }
                    setRejectTarget(undefined);
                    run(detail.application.applicationId, () => api.joinReject(detail.application.applicationId, reason), "已拒绝并留痕");
                  }}
                  onRevoke={() => run(detail.application.applicationId, () => api.joinRevoke(detail.application.applicationId), "已撤销")}
                />
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </section>
  );
}

function JoinApplicationRow({
  detail,
  busy,
  queued,
  isOperator,
  viewerCanReview,
  rejectOpen,
  rejectReason,
  onRejectReasonChange,
  onReviewStart,
  onApprove,
  onRejectOpen,
  onRejectCancel,
  onRejectSubmit,
  onRevoke
}: {
  readonly detail: StoreJoinApplicationDetailView;
  readonly busy: boolean;
  /** 该行的治理动作已排队等待前序动作完成，未被执行也未被丢弃。 */
  readonly queued: boolean;
  readonly isOperator: boolean;
  readonly viewerCanReview: boolean;
  readonly rejectOpen: boolean;
  readonly rejectReason: string;
  readonly onRejectReasonChange: (value: string) => void;
  readonly onReviewStart: () => void;
  readonly onApprove: () => void;
  readonly onRejectOpen: () => void;
  readonly onRejectCancel: () => void;
  readonly onRejectSubmit: () => void;
  readonly onRevoke: () => void;
}) {
  const application = detail.application;
  const canReview = viewerCanReview && (application.status === "applied" || application.status === "under_review");
  return (
    <tr data-testid="store-join-row" data-join-status={application.status}>
      <td>
        <span className="mono" title={application.applicationId}>{shortValue(application.applicationId)}</span>
        <p className="muted">{new Date(application.submittedAt).toLocaleString()}</p>
        {detail.identityPairing.bindingStatus !== "not_found" ? (
          <p className="muted">身份配对：{detail.identityPairing.bindingStatus === "active" ? "有效" : "已撤销"}</p>
        ) : null}
      </td>
      <td>
        <ClipboardList /> {application.roleSlotId}
        <p className="muted">{application.authorizationKind === "signal_submitter" ? "signal 提交资格" : `stage 执行者${application.stageId ? ` · ${application.stageId}` : ""}`}</p>
      </td>
      <td>
        <span className="mono">{shortValue(application.applicantAddress)}</span>
        {application.applicantDisplayName ? <p className="muted">{application.applicantDisplayName}</p> : null}
      </td>
      <td>
        <span className={`join-status is-${application.status}`}>{JOIN_STATUS_LABELS[application.status]}</span>
        {application.rejectionReason ? <p className="muted">理由：{application.rejectionReason}</p> : null}
        {application.revocationReason ? <p className="muted">撤销：{application.revocationReason}</p> : null}
      </td>
      <td>
        {application.txEvidence.length === 0 ? (
          <span className="muted">未产生</span>
        ) : (
          <ul className="join-evidence">
            {application.txEvidence.map((entry, index) => (
              <li key={`${entry.kind}-${index}`}>
                <BadgeCheck /> {evidenceKindLabel(entry.kind)} · {entry.status === "materialized" ? "已落地" : "已记录"}
                {entry.txHash ? <span className="mono" title={entry.txHash}> · {shortValue(entry.txHash)}</span> : null}
                {entry.executionMode === "simulated" ? <span className="muted">（模拟交易）</span> : null}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td>
        {busy ? <Loader2 className="spin" /> : null}
        {queued ? <span className="muted">排队中…</span> : null}
        {canReview ? (
          <div className="join-actions">
            {application.status === "applied" ? (
              <button className="secondary-button" onClick={onReviewStart} disabled={busy}>开始审核</button>
            ) : null}
            <button className="primary-button" onClick={onApprove} disabled={busy}>通过并配对身份</button>
            {rejectOpen ? (
              <div className="join-reject-box">
                <input
                  value={rejectReason}
                  onChange={(event) => onRejectReasonChange(event.target.value)}
                  placeholder="拒绝理由（必填，留痕）"
                  data-testid="store-join-reject-reason"
                />
                <button className="primary-button is-danger" onClick={onRejectSubmit} disabled={busy}>确认拒绝</button>
                <button className="secondary-button" onClick={onRejectCancel} disabled={busy}>取消</button>
              </div>
            ) : (
              <button className="secondary-button" onClick={onRejectOpen} disabled={busy}>拒绝</button>
            )}
          </div>
        ) : null}
        {(application.status === "authorized" || application.status === "active") && (canReview || isOperator) ? (
          <button className="secondary-button" onClick={onRevoke} disabled={busy}>撤销</button>
        ) : null}
        {!canReview && application.status !== "authorized" && application.status !== "active" ? (
          <span className="muted">—</span>
        ) : null}
      </td>
    </tr>
  );
}

function evidenceKindLabel(kind: string): string {
  switch (kind) {
    case "identity_binding":
      return "身份绑定";
    case "signal_submitter":
      return "signal 提交授权";
    case "stage_executor":
      return "stage 执行者授权";
    default:
      return kind;
  }
}

/**
 * 入驻成功文案：\"模拟交易未上链\"的提示只在该次审批产生的链上证据
 * executionMode=simulated 时附带；真实上链执行不得再挂模拟话术。
 */
function joinApproveMessage(result: unknown): string {
  const base = "已通过：身份配对已执行，见下方证据栏的交易记录";
  const detail = (result as StoreApiResult<StoreJoinApplicationDetailView> | undefined)?.data;
  const simulated = detail?.application.txEvidence.some((entry) => entry.executionMode === "simulated");
  return simulated ? `${base}（模拟交易为本地广播，未上链）` : base;
}
