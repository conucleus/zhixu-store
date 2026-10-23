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

function code(gate: ReturnType<typeof evaluateJoinEntryGate>): string | undefined {
  return gate.open ? undefined : gate.code;
}

describe("join entry gate (fail-closed)", () => {
  it("opens only for a public listing with a consistent anchor", () => {
    assert.deepEqual(evaluateJoinEntryGate(overlay({ listing: "public", anchor: "consistent" })), { open: true });
    assert.equal(evaluateJoinEntryGate(overlay({ listing: "public", anchor: "consistent", chainReadFailed: false })).open, true);
  });

  it("suppresses listings that are missing or not public with a named cause", () => {
    assert.equal(code(evaluateJoinEntryGate(undefined)), "listing_missing");
    assert.equal(code(evaluateJoinEntryGate(overlay({ anchor: "consistent" }))), "listing_missing");
    assert.equal(code(evaluateJoinEntryGate(overlay({ listing: "imported", anchor: "consistent" }))), "listing_pending_review");
    assert.equal(code(evaluateJoinEntryGate(overlay({ listing: "rejected", anchor: "consistent" }))), "listing_rejected");
    assert.equal(code(evaluateJoinEntryGate(overlay({ listing: "delisted", anchor: "consistent" }))), "listing_delisted");
  });

  it("suppresses anchor states that are not verified with a named cause", () => {
    assert.equal(code(evaluateJoinEntryGate(overlay({ listing: "public" }))), "anchor_missing");
    assert.equal(code(evaluateJoinEntryGate(overlay({ listing: "public", anchor: "conflict" }))), "anchor_conflict");
    assert.equal(code(evaluateJoinEntryGate(overlay({ listing: "public", anchor: "pending_indexing" }))), "anchor_pending_indexing");
    assert.equal(code(evaluateJoinEntryGate(overlay({ listing: "public", anchor: "consistent", chainReadFailed: true }))), "anchor_chain_read_failed");
    assert.equal(code(evaluateJoinEntryGate(overlay({ listing: "public", anchor: "unexpected" }))), "anchor_missing");
  });
});
