import { expect, test, type Page } from "@playwright/test";
import { STUB_API_BASE } from "./stub-api";

const storeRow = {
  zhixuId: "store-generic-1",
  title: "通用秩序",
  subtitle: "由发布者配置的协作规则",
  maintainer: "维护方",
  versionLabel: "v1",
  lifecycleStatus: "active",
  lifecycleLabel: "可用",
  reviewStatus: "approved",
  reviewLabel: "审核通过",
  riskLevel: "未声明",
  stageCount: 2,
  roleSlotCount: 2,
  orderCount: 0,
  openTaskCount: 0,
  supplierCount: 0,
  metricsStatus: "unknown",
  planId: "plan-generic-1",
  planHash: "hash-generic-1",
  planPublication: {
    status: "published",
    label: "已发布",
    stateMachineLabel: "已部署",
    planId: "plan-generic-1",
    planHash: "hash-generic-1"
  },
  nextAction: "查看秩序资料",
  updatedAt: "2026-09-04T00:00:00.000Z",
  proofRows: []
};

async function installStoreTrustRoutes(page: Page): Promise<void> {
  await page.route(`${STUB_API_BASE}/store/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/store/session") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: {
        authenticated: false,
        accessLevel: "anonymous_read",
        roles: ["anonymous_read"],
        capabilities: ["store.read"],
        authMode: "anonymous"
      } }) });
      return;
    }
    if (pathname === "/store/zhixus") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        sourceOfTruth: "contracts-and-chain-events",
        summary: { totalZhixus: 1, activeZhixus: 1, needsReview: 0, runningOrders: 0, openTasks: 0, registeredSuppliers: 0 },
        zhixus: [storeRow]
      }) });
      return;
    }
    if (pathname === "/store/runtime/summary") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        sourceOfTruth: "contracts-and-chain-events",
        activeZhixuCount: 1,
        runningOrderCount: 2,
        openTaskCount: 3,
        blockedOrderCount: 1,
        indexerStatus: "degraded",
        updatedAt: "2026-09-04T01:00:00.000Z"
      }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
  });
}

test("operations block renders unknown metrics without converting them to zero", async ({ page }) => {
  await installStoreTrustRoutes(page);
  await page.goto("/store");

  await page.getByRole("tab", { name: "运营" }).click();
  await expect(page.getByTestId("store-operations-page")).toBeVisible();

  const runningOrders = page.locator('.store-summary-strip .summary-item').filter({ hasText: "运行订单" });
  await expect(runningOrders).toContainText("未知");
  await expect(runningOrders).not.toContainText("0 单");
  await expect(runningOrders).toHaveAttribute("data-metric-status", "unknown");

  const suppliers = page.locator('.store-summary-strip .summary-item').filter({ hasText: "已登记执行方" });
  await expect(suppliers).toContainText("未知");
  await expect(suppliers).not.toContainText("0 个");
});

test("operations block exposes indexer degradation and aggregate order/task counts", async ({ page }) => {
  await installStoreTrustRoutes(page);
  await page.goto("/store");

  await page.getByRole("tab", { name: "运营" }).click();
  await expect(page.getByTestId("store-operations-page")).toBeVisible();

  await expect(page.getByTestId("store-runtime-indexer-status")).toContainText("索引降级");
  const runtimeGrid = page.locator(".store-runtime-grid");
  await expect(runtimeGrid).toContainText("阻塞订单");
  await expect(runtimeGrid).toContainText("运行订单");
  await expect(runtimeGrid).toContainText("开放待办");
});
