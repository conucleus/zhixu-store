import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpProductApiClient, WorkbenchLoadError } from "./api";

interface StubRoute {
  readonly status?: number;
  readonly body?: unknown;
}

const stubZhixuA = {
  zhixuId: "zhixu-a",
  title: "秩序 A",
  reviewStatus: "approved"
};

const stubZhixuB = {
  zhixuId: "zhixu-b",
  title: "秩序 B",
  reviewStatus: "approved"
};

const stubDetail = (zhixu: typeof stubZhixuA) => ({
  zhixu: {
    ...zhixu,
    stages: [],
    roleSlots: [],
    dockableModules: [],
    orderPermissionTable: [],
    proofRows: [],
    planPublication: {
      status: "published",
      label: "已发布",
      stateMachineLabel: "已部署",
      planId: "0xplan",
      planHash: "0xhash"
    }
  }
});

const stubOrders = { orders: [] };
const stubTasks = { tasks: [] };
const stubMe = {
  participant: {
    participantId: "wallet:0xabc",
    displayName: "测试执行方",
    roleLabels: ["报关行"],
    source: "wallet"
  }
};

function fetchFromRoutes(routes: Readonly<Record<string, StubRoute>>): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/u, "");
    const route = routes[path];
    if (route) {
      return new Response(JSON.stringify(route.body ?? {}), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
}

function baseRoutes(overrides: Readonly<Record<string, StubRoute>> = {}): Readonly<Record<string, StubRoute>> {
  return {
    "/product/zhixus": { body: { zhixus: [stubZhixuA, stubZhixuB] } },
    "/product/zhixus/zhixu-a": { body: stubDetail(stubZhixuA) },
    "/product/zhixus/zhixu-b": { body: stubDetail(stubZhixuB) },
    "/product/orders": { body: stubOrders },
    "/product/tasks": { body: stubTasks },
    "/product/me": { body: stubMe },
    ...overrides
  };
}

function clientWith(routes: Readonly<Record<string, StubRoute>>): HttpProductApiClient {
  return new HttpProductApiClient("https://api.test", { fetchImpl: fetchFromRoutes(routes) });
}

describe("workbench data loading tolerance boundary", () => {
  it("degrades a single zhixu detail failure to diagnostics and keeps the rest usable", async () => {
    const client = clientWith(baseRoutes({
      "/product/zhixus/zhixu-b": { status: 404, body: { error: "not_found" } }
    }));

    const data = await client.loadWorkbenchData();

    assert.equal(data.zhixus.length, 1);
    assert.equal(data.zhixus[0]?.zhixuId, "zhixu-a");
    assert.ok(data.orders);
    assert.ok(data.tasks);
    assert.equal(data.participant?.displayName, "测试执行方");
    const degraded = data.diagnostics.find((diag) => diag.endpoint === "/product/zhixus/zhixu-b");
    assert.ok(degraded, "failed zhixu detail must be recorded in diagnostics");
    assert.equal(degraded.status, 404);
  });

  it("still fails closed when a critical endpoint (/product/orders) fails", async () => {
    const client = clientWith(baseRoutes({
      "/product/orders": { status: 500, body: { error: "internal_server_error" } }
    }));

    await assert.rejects(
      client.loadWorkbenchData(),
      (error: unknown) => {
        assert.ok(error instanceof WorkbenchLoadError);
        assert.ok(error.diagnostics.some((diag) => diag.endpoint === "/product/orders"));
        return true;
      }
    );
  });

  it("tolerates /product/me failure without inferring identity", async () => {
    const client = clientWith(baseRoutes({
      "/product/me": { status: 403, body: { error: "forbidden" } }
    }));

    const data = await client.loadWorkbenchData();

    assert.equal(data.zhixus.length, 2);
    assert.equal(data.participant, undefined);
    assert.ok(data.diagnostics.some((diag) => diag.endpoint === "/product/me"));
  });

  it("keeps syncState ready when everything succeeds and reports no diagnostics", async () => {
    const client = clientWith(baseRoutes());

    const data = await client.loadWorkbenchData();

    assert.equal(data.diagnostics.length, 0);
    assert.equal(data.syncState, "ready");
    assert.equal(data.zhixus.length, 2);
  });
});

describe("write paths honor the injected fetchImpl", () => {
  it("routes createOrderDraft through the injected fetch and never touches global fetch", async () => {
    const calls: Array<{ readonly path: string; readonly method: string; readonly body: unknown }> = [];
    const injected = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({
        path: url.replace(/^https?:\/\/[^/]+/u, ""),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      });
      return new Response(JSON.stringify({ draft: { draftId: "draft-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    // 全局 fetch 直接炸掉：写路径若漏传 fetchImpl 回退到全局实现，测试会立即失败
    const globalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("global fetch must not be used when fetchImpl is injected");
    }) as typeof fetch;
    try {
      const client = new HttpProductApiClient("https://api.test", { fetchImpl: injected });
      const result = await client.createOrderDraft({
        zhixuId: "zhixu-a",
        title: "注入测试订单",
        businessType: "工业设备",
        totalAmount: "100",
        currency: "USDC"
      });
      assert.equal(result.data.draftId, "draft-1");
      assert.equal(result.source.baseUrl, "https://api.test");
      assert.deepEqual(
        calls,
        [{
          path: "/product/order-drafts",
          method: "POST",
          body: {
            zhixuId: "zhixu-a",
            title: "注入测试订单",
            businessType: "工业设备",
            totalAmount: "100",
            currency: "USDC"
          }
        }]
      );
    } finally {
      globalThis.fetch = globalFetch;
    }
  });
});
