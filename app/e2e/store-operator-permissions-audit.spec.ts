import { expect, test } from "@playwright/test";
import { STUB_API_BASE } from "./workbench-stubs";

/**
 * operator 面的边界回归（fixture 全桩）：
 * Store Console 只承载设计/组织/运营/维护/链接/账号，不暴露参与者工作台、
 * 审计路由或治理后门；`/app` 也不再是参与者入口。
 */
test("operator console exposes no participant workbench, audit route, or governance backdoor", async ({ page }) => {
  await page.route(`${STUB_API_BASE}/store/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const fulfill = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/store/session") {
      await fulfill({
        session: {
          authenticated: true,
          accessLevel: "store_operator",
          roles: ["store_operator"],
          capabilities: ["store.read", "store.draft.import"],
          authMode: "dev_store_headers"
        }
      });
      return;
    }
    if (pathname === "/store/zhixus") {
      await fulfill({
        sourceOfTruth: "contracts-and-chain-events",
        summary: { totalZhixus: 0, activeZhixus: 0, needsReview: 0, runningOrders: 0, openTasks: 0, registeredSuppliers: 0 },
        zhixus: []
      });
      return;
    }
    if (pathname === "/store/runtime/summary") {
      await fulfill({
        sourceOfTruth: "contracts-and-chain-events",
        activeZhixuCount: 0,
        runningOrderCount: 0,
        openTaskCount: 0,
        blockedOrderCount: 0,
        indexerStatus: "ready",
        updatedAt: "2026-09-01T00:00:00.000Z"
      });
      return;
    }
    if (pathname === "/store/suppliers") {
      await fulfill({ suppliers: [] });
      return;
    }
    if (pathname === "/store/join-applications") {
      await fulfill({ applications: [], scope: "viewer" });
      return;
    }
    await fulfill({ error: "not_found" }, 404);
  });

  await page.goto("/app");

  // /app 不再是参与者入口：落到运营台。
  await expect(page).toHaveURL(/\/store$/);
  await expect(page.getByTestId("store-app")).toBeVisible();
  await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
  await expect(page.getByTestId("product-workbench")).toHaveCount(0);

  // 不暴露审计路由/治理后门，也不给参与者动作入口。
  await expect(page.getByText("Store audit")).toHaveCount(0);
  await expect(page.getByText("/store/audit")).toHaveCount(0);
  await expect(page.locator('a[href*="/audit"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "我的待办" })).toHaveCount(0);
  await expect(page.getByTestId("task-confirm-button")).toHaveCount(0);
  await expect(page.getByTestId("submit-confirm-button")).toHaveCount(0);
});
