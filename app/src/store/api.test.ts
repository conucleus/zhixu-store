import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StoreApiError, parseStoreRuntimeSummary, readableStoreError } from "./api";

describe("Store runtime DTO boundary", () => {
  it("keeps the frozen runtime fields and indexer state", () => {
    assert.deepEqual(parseStoreRuntimeSummary({
      sourceOfTruth: "contracts-and-chain-events",
      activeZhixuCount: 3,
      runningOrderCount: 4,
      openTaskCount: 5,
      blockedOrderCount: 1,
      indexerStatus: "syncing",
      updatedAt: "2026-09-04T00:00:00.000Z"
    }), {
      sourceOfTruth: "contracts-and-chain-events",
      activeZhixuCount: 3,
      runningOrderCount: 4,
      openTaskCount: 5,
      blockedOrderCount: 1,
      indexerStatus: "syncing",
      updatedAt: "2026-09-04T00:00:00.000Z"
    });
  });

  it("rejects incomplete runtime data instead of inventing zeroes", () => {
    assert.throws(
      () => parseStoreRuntimeSummary({
        sourceOfTruth: "contracts-and-chain-events",
        activeZhixuCount: 3,
        runningOrderCount: 4,
        openTaskCount: 5
      }),
      (error: unknown) => error instanceof StoreApiError && error.message === "store_runtime_summary_response_invalid"
    );
  });
});

describe("ambiguous Store order errors", () => {
  it("surfaces 409 candidates instead of treating the response as empty", () => {
    const error = new StoreApiError("/store/orders/abc", 409, "order_id_ambiguous", {
      code: "order_id_ambiguous",
      details: { candidates: [{ orderId: "order-1", title: "订单一" }, { orderId: "order-2" }] }
    });
    assert.equal(readableStoreError(error, "fallback"), "409：订单标识不唯一，请选择候选记录：订单一（order-1）、order-2");
  });
});
