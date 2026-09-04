import { AlertTriangle, CheckCircle2, CircleDashed, ShieldCheck } from "lucide-react";
import type { StoreAnchorVerificationView, StoreListingView } from "./types";
import { shortValue } from "../shared/frontend";

const ANCHOR_STATUS_LABELS: Record<StoreAnchorVerificationView["status"], string> = {
  consistent: "一致",
  conflict: "冲突",
  pending_indexing: "等待索引"
};

/**
 * PRD92 锚核验面板：呈现 planHash/planPublisher/状态机地址与核验结果。
 * listing 与链不一致时页面必须显式呈现冲突并抑制加入入口（由父组件处理）。
 */
export function StoreAnchorPanel({
  verification,
  listing,
}: {
  readonly verification: StoreAnchorVerificationView | undefined;
  readonly listing: StoreListingView | undefined;
}) {
  if (!verification && !listing) {
    return null;
  }
  const status = verification?.status ?? "pending_indexing";
  const publisher = verification?.projection.publisher;
  return (
    <section className="side-panel store-anchor-panel" data-testid="store-anchor-panel" data-anchor-status={status}>
      <div className="side-panel-title">
        <h3>链上锚核验</h3>
        <span className={`anchor-status is-${status}`}>
          {status === "consistent" ? <CheckCircle2 /> : status === "conflict" ? <AlertTriangle /> : <CircleDashed />}
          {ANCHOR_STATUS_LABELS[status]}
        </span>
      </div>
      <div className="store-anchor-facts">
        <span>Plan Hash <code>{shortValue(verification?.projection.planHash ?? "—")}</code></span>
        <span>发布者 <code title={publisher ?? undefined}>{publisher ? shortValue(publisher) : "未记录"}</code></span>
        <span>状态机 <code>{verification?.projection.stateMachineAddress ? shortValue(verification.projection.stateMachineAddress) : "—"}</code></span>
        {verification?.chain ? (
          <span>链直读 {verification.chain.planFinalized ? "已 finalize" : "未 finalize"}{verification.chain.planPublisher ? ` · ${shortValue(verification.chain.planPublisher)}` : ""}</span>
        ) : (
          <span className="muted">链直读不可用（未配置 RPC 时退化为投影比对）</span>
        )}
      </div>
      {listing ? (
        <p className="store-anchor-listing">
          上架状态：<strong>{listingStatusLabel(listing.status)}</strong>
          {listing.delistReason ? <span className="muted">（{listing.delistReason}）</span> : null}
        </p>
      ) : (
        <p className="muted">该秩序尚未在 Store 上架（listing 不存在不影响链上事实）。</p>
      )}
      {verification ? (
        <ul className="store-anchor-checks" data-testid="store-anchor-checks">
          {verification.checks.map((check) => (
            <li key={check.id} className={`anchor-check is-${check.outcome}`} data-check-id={check.id}>
              {check.outcome === "match" ? <CheckCircle2 /> : check.outcome === "mismatch" ? <AlertTriangle /> : <CircleDashed />}
              <span>{check.label}</span>
              {check.outcome === "mismatch" ? (
                <small>声称 {shortValue(check.expected ?? "—")} / 实际 {shortValue(check.actual ?? "—")}</small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="store-anchor-note">
        <ShieldCheck /> 下架/隐藏只改变 Store 可见性；链上 plan 与既有订单不受影响。
      </p>
    </section>
  );
}

export function listingStatusLabel(status: StoreListingView["status"]): string {
  switch (status) {
    case "imported":
      return "已导入（待审核）";
    case "public":
      return "已公开";
    case "rejected":
      return "审核未通过";
    case "delisted":
      return "已下架";
  }
}

/** PRD92 红线：锚冲突或已下架时抑制加入入口。 */
export function joinEntrySuppressed(
  verification: StoreAnchorVerificationView | undefined,
  listing: StoreListingView | undefined,
): boolean {
  if (verification?.status === "conflict") {
    return true;
  }
  if (listing?.status === "delisted") {
    return true;
  }
  return false;
}

export function joinSuppressionReason(
  verification: StoreAnchorVerificationView | undefined,
  listing: StoreListingView | undefined,
): string | undefined {
  if (verification?.status === "conflict") {
    return "listing 与链上注册事实不一致，加入入口已被抑制；请以链上数据为准并联系 Store 运营方。";
  }
  if (listing?.status === "delisted") {
    return "该秩序已下架：目录与搜索不可见，加入入口关闭；链上 plan 与既有订单不受影响。";
  }
  return undefined;
}
