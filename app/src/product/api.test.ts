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

  it("keeps restricted published zhixus in the product catalog", async () => {
    const restricted = { ...stubZhixuB, reviewStatus: "restricted" };
    const client = clientWith(baseRoutes({
      "/product/zhixus": { body: { zhixus: [restricted] } },
      "/product/zhixus/zhixu-b": { body: stubDetail(restricted) }
    }));

    const data = await client.loadWorkbenchData();

    assert.equal(data.zhixus[0]?.zhixuId, "zhixu-b");
  });

  it("reports a diagnostic when every visible zhixu detail fails instead of returning an empty catalog", async () => {
    const client = clientWith(baseRoutes({
      "/product/zhixus/zhixu-a": { status: 503, body: { error: "service_unavailable" } },
      "/product/zhixus/zhixu-b": { status: 503, body: { error: "service_unavailable" } }
    }));

    await assert.rejects(
      client.loadWorkbenchData(),
      (error: unknown) => {
        assert.ok(error instanceof WorkbenchLoadError);
        assert.equal(error.diagnostics.filter((diag) => diag.endpoint.startsWith("/product/zhixus/")).length, 2);
        return true;
      }
    );
  });

  it("orders Product records by the explicit API projection block extension", async () => {
    const client = clientWith(baseRoutes({
      "/product/orders": {
        body: {
          orders: [
            { orderId: "older", status: "registered", projection: { updatedAtBlock: "9007199254740993" } },
            { orderId: "newer", status: "registered", projection: { updatedAtBlock: "9007199254740995" } }
          ]
        }
      },
      "/product/tasks": {
        body: {
          tasks: [
            { taskId: "task-old", orderId: "older", status: "open", projection: { updatedAtBlock: "9007199254740993" } },
            { taskId: "task-new", orderId: "newer", status: "open", projection: { updatedAtBlock: "9007199254740995" } }
          ]
        }
      }
    }));

    const data = await client.loadWorkbenchData();

    assert.deepEqual(data.orders.map((order) => order.orderId), ["newer", "older"]);
    assert.deepEqual(data.tasks.map((task) => task.taskId), ["task-new", "task-old"]);
  });

  it("keeps server order stable when projection freshness is absent or invalid", async () => {
    const client = clientWith(baseRoutes({
      "/product/orders": {
        body: { orders: [
          { orderId: "first", status: "registered" },
          { orderId: "second", status: "registered", projection: { updatedAtBlock: "not-a-block" } }
        ] }
      },
      "/product/tasks": { body: { tasks: [] } }
    }));

    const data = await client.loadWorkbenchData();

    assert.deepEqual(data.orders.map((order) => order.orderId), ["first", "second"]);
  });
});

describe("workbench sync state judgement", () => {
  it("reports syncing from the structured blocked task status only", async () => {
    const client = clientWith(baseRoutes({
      "/product/tasks": {
        body: { tasks: [{ taskId: "task-1", orderId: "order-1", status: "blocked" }] }
      }
    }));

    const data = await client.loadWorkbenchData();

    assert.equal(data.syncState, "syncing");
    assert.equal(data.activeTask?.status, "blocked");
  });

  it("never derives syncing from the display statusLabel of an order", async () => {
    // 后端对链上状态 unknown 的订单会下发合成标签“同步中”；
    // 标签只是渲染文案，不得充当状态机判据（中文标签不充当判据）。
    const client = clientWith(baseRoutes({
      "/product/orders": {
        body: { orders: [{ orderId: "order-1", status: "registered", statusLabel: "同步中" }] }
      }
    }));

    const data = await client.loadWorkbenchData();

    assert.equal(data.syncState, "ready");
    assert.equal(data.order?.status, "registered");
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
