import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  StoreApiError,
  parseStoreRuntimeSummary,
  readableStoreError,
  readStoredStoreSessionToken,
  storeStoreSessionToken,
  STORE_SESSION_TOKEN_STORAGE_KEY
} from "./api";

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

describe("stored wallet session token expiry", () => {
  function installMemoryWindow(): Map<string, string> {
    const backing = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
        setItem: (key: string, value: string) => backing.set(key, value),
        removeItem: (key: string) => backing.delete(key),
        clear: () => backing.clear()
      }
    };
    return backing;
  }

  it("returns a stored token while the server-declared expiry is in the future", async () => {
    const backing = installMemoryWindow();
    try {
      storeStoreSessionToken({ token: "uvs_future", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      assert.equal(readStoredStoreSessionToken(), "uvs_future");
      assert.match(backing.get(STORE_SESSION_TOKEN_STORAGE_KEY) ?? "", /uvs_future/);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("drops the stored token once the server-declared expiry has passed", async () => {
    const backing = installMemoryWindow();
    try {
      storeStoreSessionToken({ token: "uvs_past", expiresAt: new Date(Date.now() - 1_000).toISOString() });
      // 过期 token 不得继续随请求发送：读取即弃置。
      assert.equal(readStoredStoreSessionToken(), undefined);
      assert.equal(backing.has(STORE_SESSION_TOKEN_STORAGE_KEY), false);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("rejects a stored payload without a usable token instead of guessing one", async () => {
    installMemoryWindow();
    try {
      storeStoreSessionToken({ token: "not-a-session-token", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      assert.equal(readStoredStoreSessionToken(), undefined);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("clears storage on logout", async () => {
    const backing = installMemoryWindow();
    try {
      storeStoreSessionToken({ token: "uvs_clear", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      storeStoreSessionToken(undefined);
      assert.equal(readStoredStoreSessionToken(), undefined);
      assert.equal(backing.size, 0);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});
