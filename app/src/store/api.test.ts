import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BrowserStoreApiClient,
  StoreApiError,
  createStoreApiClient,
  parseStoreDockingSession,
  parseStoreRuntimeSummary,
  readableStoreError,
  readStoredStoreSessionToken,
  storeStoreSessionToken,
  STORE_SESSION_TOKEN_STORAGE_KEY
} from "./api";
import type { StoreAccessState } from "./types";

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

  it("treats a stored token with a missing or unparsable expiry as expired instead of indefinitely valid", async () => {
    // 正常登录路径必带服务端声明的 expiresAt：缺失/非法只可能来自篡改或
    // 损坏的存储，放行等于无过期凭据（fail-closed 清除并走未登录）。
    const backing = installMemoryWindow();
    try {
      window.localStorage.setItem(STORE_SESSION_TOKEN_STORAGE_KEY, JSON.stringify({ token: "uvs_no_expiry" }));
      assert.equal(readStoredStoreSessionToken(), undefined);
      assert.equal(backing.has(STORE_SESSION_TOKEN_STORAGE_KEY), false);

      window.localStorage.setItem(STORE_SESSION_TOKEN_STORAGE_KEY, JSON.stringify({ token: "uvs_bad_expiry", expiresAt: "not-a-date" }));
      assert.equal(readStoredStoreSessionToken(), undefined);
      assert.equal(backing.has(STORE_SESSION_TOKEN_STORAGE_KEY), false);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("clears a non-JSON stored payload instead of leaving it stranded forever", async () => {
    // 旧落盘格式/损坏载荷不是本读法可接受的形状：读取失败也必须清除，
    // 否则该条目永远占着存储键（与过期/缺失口径一致，均为损坏）。
    const backing = installMemoryWindow();
    try {
      window.localStorage.setItem(STORE_SESSION_TOKEN_STORAGE_KEY, "uvs_legacy_raw_token");
      assert.equal(readStoredStoreSessionToken(), undefined);
      assert.equal(backing.has(STORE_SESSION_TOKEN_STORAGE_KEY), false);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});

describe("docking session response gate", () => {
  const creator = "0x0000000000000000000000000000000000000001";

  it("keeps the server mirror's tenant basis (createdBy) as a consumed required field", () => {
    const session = parseStoreDockingSession({
      sessionId: "dock-1",
      status: "draft",
      createdBy: creator
    });
    assert.equal(session.createdBy, creator);
    assert.equal(session.sessionId, "dock-1");
  });

  it("accepts the wrapped { session } response shape used by the create route", () => {
    const session = parseStoreDockingSession({
      session: { sessionId: "dock-2", status: "valid", createdBy: creator }
    });
    assert.equal(session.createdBy, creator);
  });

  it("rejects responses missing sessionId/status/createdBy instead of blind-casting", () => {
    // createdBy 是服务端资源租户归属断言的比对基准（Address 类型）：
    // 缺失或非 20 字节 hex 地址的会话记录无法判定归属，按畸形响应
    // fail-closed，不得以 undefined 冒充。
    for (const malformed of [
      { status: "draft", createdBy: creator },
      { sessionId: "dock-1", createdBy: creator },
      { sessionId: "dock-1", status: "draft" },
      { sessionId: "dock-1", status: "unknown-status", createdBy: creator },
      { sessionId: "dock-1", status: "draft", createdBy: "tenant-name" },
      { sessionId: "dock-1", status: "draft", createdBy: "0xdock000000000000000000000000000000000001" },
      "not-a-record"
    ]) {
      assert.throws(
        () => parseStoreDockingSession(malformed),
        (error: unknown) => error instanceof StoreApiError && error.message === "docking_session_response_invalid"
      );
    }
  });
});

describe("listing write client gates mirror the server route's anchoring rule", () => {
  const operatorAccess: StoreAccessState = {
    level: "store_operator",
    label: "Store Operator",
    roles: ["store_operator"],
    capabilities: ["store.read", "store.listing.manage"],
    authMode: "dev_store_headers",
    canRead: true,
    canWrite: true,
    canAdmin: false,
    headers: {}
  };

  it("rejects listing import locally for an unanchored operator session before any request", async () => {
    // 服务端 store-listings 路由对导入（运营方与 publisher 两条路径）一律
    // 要求锚定会话；本地按同一口径前置 403，不让未锚定会话撞迟到拒绝。
    const client = createStoreApiClient(operatorAccess);
    await assert.rejects(
      () => client.importListing({ planId: `0x${"ab".repeat(32)}` }),
      (error: unknown) => error instanceof StoreApiError && error.status === 403
    );
  });

  it("rejects listing governance writes locally when the operator session is unanchored", async () => {
    const client = createStoreApiClient(operatorAccess);
    for (const action of [
      () => client.reviewListing("listing-1", "approve"),
      () => client.delistListing("listing-1"),
      () => client.relistListing("listing-1")
    ]) {
      await assert.rejects(
        action,
        (error: unknown) => error instanceof StoreApiError && error.status === 403
      );
    }
  });

  it("lets an anchored session past the local anchoring gate (server re-checks ownership)", async () => {
    const client = createStoreApiClient({
      ...operatorAccess,
      anchoredAddress: "0x0000000000000000000000000000000000000001"
    });
    // 锚定门在前、base URL 配置检查在后：锚定会话不再吃本地 403，
    // 转而按缺配置失败，证明门序与口径。
    await assert.rejects(
      () => client.importListing({ planId: `0x${"ab".repeat(32)}` }),
      (error: unknown) => error instanceof StoreApiError && /not configured/u.test(error.message)
    );
  });
});

describe("store client session header sourcing", () => {
  const plainAccess: StoreAccessState = {
    level: "store_read",
    label: "Store Read",
    roles: ["store_read"],
    capabilities: ["store.read"],
    authMode: "dev_store_headers",
    canRead: true,
    canWrite: false,
    canAdmin: false,
    headers: {}
  };

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

  function clientWithCapturedRequests(seen: Array<Headers>): BrowserStoreApiClient {
    const injected = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      seen.push(new Headers(init?.headers));
      return new Response(JSON.stringify({ suppliers: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
    return new BrowserStoreApiClient("https://api.test", {
      access: plainAccess,
      sessionToken: readStoredStoreSessionToken,
      fetchImpl: injected
    });
  }

  it("re-reads the stored session token on every request instead of pinning it at construction", async () => {
    // 与 product 侧同口径：凭据头每请求现读存储，token 落盘/更换后下一次
    // 请求即刻生效，不等 client 重建。
    installMemoryWindow();
    try {
      const seen: Array<Headers> = [];
      const client = clientWithCapturedRequests(seen);
      storeStoreSessionToken({ token: "uvs_first", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      await client.listSuppliers();
      storeStoreSessionToken({ token: "uvs_second", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      await client.listSuppliers();

      assert.equal(seen[0]?.get("x-uvp-store-session"), "uvs_first");
      assert.equal(seen[1]?.get("x-uvp-store-session"), "uvs_second");
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("omits the session header once the stored token has expired instead of sending stale credentials", async () => {
    // 过期即弃是本地卫生线：不得把必然失效的凭据继续外发、留给服务端 401 兜底。
    const backing = installMemoryWindow();
    try {
      const seen: Array<Headers> = [];
      const client = clientWithCapturedRequests(seen);
      storeStoreSessionToken({ token: "uvs_first", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      await client.listSuppliers();
      // 把已落盘会话的过期时间改写为已过去，模拟挂起页面上凭据自然过期。
      window.localStorage.setItem(
        STORE_SESSION_TOKEN_STORAGE_KEY,
        JSON.stringify({ token: "uvs_first", expiresAt: new Date(Date.now() - 1_000).toISOString() })
      );
      await client.listSuppliers();

      assert.equal(seen[0]?.get("x-uvp-store-session"), "uvs_first");
      assert.equal(seen[1]?.get("x-uvp-store-session"), null);
      assert.equal(backing.has(STORE_SESSION_TOKEN_STORAGE_KEY), false);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});
