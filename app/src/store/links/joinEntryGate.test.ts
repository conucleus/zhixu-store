import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateJoinEntryGate, type JoinEntryOverlayLike } from "./joinEntryGate";

function overlay(input: {
  readonly listing?: string | undefined;
  readonly anchor?: string | undefined;
  readonly chainReadFailed?: boolean | undefined;
}): JoinEntryOverlayLike {
  return {
    ...(input.listing ? { listing: { status: input.listing } } : {}),
    ...(input.anchor
      ? {
        anchorVerification: {
          status: input.anchor,
          ...(input.chainReadFailed === true ? { chainReadFailed: true } : {})
        }
      }
      : {})
  };
}

describe("join entry gate (fail-closed)", () => {
  it("opens only for public listing with a consistent anchor", () => {
    assert.deepEqual(evaluateJoinEntryGate(overlay({ listing: "public", anchor: "consistent" })), { open: true });
  });

  it("suppresses a zhixu that never entered the listing flow", () => {
    // 服务端对"没有 listing"放行；前端必须自己关掉入口（旧详情页红线）。
    const gate = evaluateJoinEntryGate(overlay({ anchor: "consistent" }));
    assert.equal(gate.open, false);
    assert.equal(gate.open === false && gate.code, "listing_missing");
  });

  it("suppresses missing or empty overlay", () => {
    assert.equal(evaluateJoinEntryGate(undefined).open, false);
    assert.equal(evaluateJoinEntryGate({}).open, false);
  });

  it("suppresses pending-review and rejected listings", () => {
    const imported = evaluateJoinEntryGate(overlay({ listing: "imported", anchor: "consistent" }));
    assert.equal(imported.open, false);
    assert.equal(imported.open === false && imported.code, "listing_pending_review");

    const rejected = evaluateJoinEntryGate(overlay({ listing: "rejected", anchor: "consistent" }));
    assert.equal(rejected.open, false);
    assert.equal(rejected.open === false && rejected.code, "listing_rejected");
  });

  it("suppresses a delisted listing even when the anchor is consistent", () => {
    const gate = evaluateJoinEntryGate(overlay({ listing: "delisted", anchor: "consistent" }));
    assert.equal(gate.open, false);
    assert.equal(gate.open === false && gate.code, "listing_delisted");
  });

  it("suppresses a conflicting anchor even when the listing is public", () => {
    const gate = evaluateJoinEntryGate(overlay({ listing: "public", anchor: "conflict" }));
    assert.equal(gate.open, false);
    assert.equal(gate.open === false && gate.code, "anchor_conflict");
  });

  it("suppresses pending_indexing and unknown anchor states", () => {
    const pending = evaluateJoinEntryGate(overlay({ listing: "public", anchor: "pending_indexing" }));
    assert.equal(pending.open, false);
    assert.equal(pending.open === false && pending.code, "anchor_pending_indexing");

    const unknown = evaluateJoinEntryGate(overlay({ listing: "public", anchor: "something_unexpected" }));
    assert.equal(unknown.open, false);
    assert.equal(unknown.open === false && unknown.code, "anchor_missing");
  });

  it("suppresses a public listing with no anchor verification at all", () => {
    const gate = evaluateJoinEntryGate(overlay({ listing: "public" }));
    assert.equal(gate.open, false);
    assert.equal(gate.open === false && gate.code, "anchor_missing");
  });

  it("suppresses a public listing when the chain read failed", () => {
    const gate = evaluateJoinEntryGate(overlay({ listing: "public", anchor: "consistent", chainReadFailed: true }));
    assert.equal(gate.open, false);
    assert.equal(gate.open === false && gate.code, "anchor_chain_read_failed");
  });

  it("never reports open without an explicit public listing and consistent anchor", () => {
    const listingStatuses = [undefined, "imported", "public", "rejected", "delisted", "weird"];
    const anchorStatuses = [undefined, "consistent", "conflict", "pending_indexing", "weird"];
    for (const listing of listingStatuses) {
      for (const anchor of anchorStatuses) {
        const gate = evaluateJoinEntryGate(overlay({ listing, anchor }));
        const expected = listing === "public" && anchor === "consistent";
        assert.equal(gate.open, expected, `listing=${listing} anchor=${anchor}`);
      }
    }
  });
});
