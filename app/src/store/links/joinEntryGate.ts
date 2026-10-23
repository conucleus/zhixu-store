/**
 * 加入入口的 fail-closed 门：listing 必须 public，锚定必须 consistent。
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
    return suppress("listing_missing", "该秩序尚未完成上架流程，暂不开放加入。");
  }
  if (listing.status === "delisted") {
    return suppress("listing_delisted", "该秩序已下架，暂不开放加入。");
  }
  if (listing.status === "rejected") {
    return suppress("listing_rejected", "该秩序上架未通过审核，暂不开放加入。");
  }
  if (listing.status !== "public") {
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
    return suppress("anchor_missing", "该秩序的上架锚定状态无法确认，暂不开放加入。");
  }
  return OPEN;
}

function suppress(code: JoinEntrySuppressionCode, reason: string): JoinEntryGate {
  return { open: false, code, reason };
}
