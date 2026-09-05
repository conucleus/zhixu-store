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

describe("Store conflict errors", () => {
  it("renders 409 with the server error code instead of order-domain copy the client cannot produce", () => {
    const error = new StoreApiError("/store/zhixu-drafts/draft-1/submit-review", 409, "compile_failed", {
      code: "compile_failed",
      details: { candidates: [{ orderId: "order-1", title: "订单一" }, { orderId: "order-2" }] }
    });
    // Store 客户端没有订单端点：409 一律按通用冲突话术呈现，不得套订单域文案。
    assert.equal(readableStoreError(error, "fallback"), "409：请求与服务端当前状态冲突（compile_failed），请刷新后重试");
  });
});
