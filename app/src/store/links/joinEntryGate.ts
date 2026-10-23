/**
 * 加入入口的开闭门（fail-closed）：
 *
 * 服务端在 `assertJoinEntryAllowedNow` 里只拦 imported/delisted/conflict/
 * chainReadFailed；**没有 listing（未走上架流）时服务端直接放行**。因此
 * "未上架不出现加入入口"这条红线只能由前端守住——收敛时 StoreZhixuDetailPage
 * 被删除，这段抑制逻辑随页面一起丢了，这里把它收回成纯函数，别放进渲染分支。
 *
 * 规则（全部不满足即不渲染 StoreJoinEntry，也不发任何 join 请求）：
 *   listing.status === "public"
 *   且 anchorVerification 存在、status === "consistent"、chainReadFailed !== true。
 *
 * 服务端响应里的 `anchorVerification.chainReadFailed` 不在前端 view 类型上
 * （见 store/types.ts），这里用窄结构声明读取，不碰 DTO。
 */
export interface JoinEntryOverlayLike {
  readonly listing?: { readonly status?: string | undefined } | undefined;
  readonly anchorVerification?: {
    readonly status?: string | undefined;
    readonly chainReadFailed?: boolean | undefined;
  } | undefined;
}

export type JoinEntrySuppressionCode =
  | "listing_missing"
  | "listing_pending_review"
  | "listing_rejected"
  | "listing_delisted"
  | "anchor_missing"
  | "anchor_conflict"
  | "anchor_pending_indexing"
  | "anchor_chain_read_failed";

export type JoinEntryGate =
  | { readonly open: true }
  | { readonly open: false; readonly code: JoinEntrySuppressionCode; readonly reason: string };

const OPEN: JoinEntryGate = { open: true };

export function evaluateJoinEntryGate(overlay: JoinEntryOverlayLike | undefined): JoinEntryGate {
  const listing = overlay?.listing;
  if (!listing) {
    // 从未走上架流：旧详情页同样按"未完成上架"抑制（服务端此时不设门，前端必须是门）。
    return suppress("listing_missing", "该秩序尚未完成上架流程，暂不开放加入。");
  }
  if (listing.status === "delisted") {
    return suppress("listing_delisted", "该秩序已下架，暂不开放加入。");
  }
  if (listing.status === "rejected") {
    return suppress("listing_rejected", "该秩序上架未通过审核，暂不开放加入。");
  }
  if (listing.status !== "public") {
    // imported / 未知状态：审核期间不放开加入。
    return suppress("listing_pending_review", "该秩序上架仍在审核中，暂不开放加入。");
  }

  const anchor = overlay?.anchorVerification;
  if (!anchor) {
    return suppress("anchor_missing", "该秩序的上架锚定尚未核验，暂不开放加入。");
  }
  if (anchor.chainReadFailed === true) {
    return suppress("anchor_chain_read_failed", "该秩序的上架锚定链上读取失败，暂不开放加入。");
  }
  if (anchor.status === "conflict") {
    return suppress("anchor_conflict", "该秩序的上架锚定与链上事实冲突，暂不开放加入。");
  }
  if (anchor.status === "pending_indexing") {
    return suppress("anchor_pending_indexing", "该秩序的上架锚定核验尚未完成，暂不开放加入。");
  }
  if (anchor.status !== "consistent") {
    // 未知锚状态一律按未核验处理，不猜"大概没问题"。
    return suppress("anchor_missing", "该秩序的上架锚定状态无法确认，暂不开放加入。");
  }
  return OPEN;
}

function suppress(code: JoinEntrySuppressionCode, reason: string): JoinEntryGate {
  return { open: false, code, reason };
}
