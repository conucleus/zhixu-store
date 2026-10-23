import { expect, test, type Page } from "@playwright/test";
import { STUB_API_BASE } from "./workbench-stubs";

/**
 * 入口契约（operator-only，fixture 全桩）：
 * - 本站只有 Store Console 一面：`/` 与 `/store` 都渲染运营台，`/` 规整到 `/store`；
 * - 不存在 `/app` 参与者工作台、`我的待办`、任务/提交确认按钮；
 * - 导航固定为 设计 / 组织 / 运营 / 维护 / 链接 / 账号与地址，
 *   没有目录、检索、公开上架、participant 入口。
 * 参与方履约面（订单/待办/证据/签名）归 uvp-order-app，不在本应用内可达。
 */
test.describe("Store console entry contract", () => {
  test("/ normalizes to /store and renders the operator console", async ({ page }) => {
    await stubStoreRoutes(page);
    await page.goto("/");

    await expect(page).toHaveURL(/\/store$/);
    await expect(page.getByTestId("store-app")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Store Console" })).toBeVisible();
    await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "我的待办" })).toHaveCount(0);
  });

  test("/store renders the operator console without participant submission surfaces", async ({ page }) => {
    await stubStoreRoutes(page);
    await page.goto("/store");

    await expect(page.getByTestId("store-app")).toBeVisible();
    await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
    await expect(page.getByTestId("task-confirm-button")).toHaveCount(0);
    await expect(page.getByTestId("submit-confirm-button")).toHaveCount(0);
    // 旧契约的「订单工作台」入口（/app）已不存在。
    await expect(page.getByRole("link", { name: "订单工作台" })).toHaveCount(0);
    await expect(page.locator('a[href="/app"]')).toHaveCount(0);
  });

  test("/app no longer serves a participant workbench: it lands on the operator console", async ({ page }) => {
    await stubStoreRoutes(page);
    await page.goto("/app");

    await expect(page).toHaveURL(/\/store$/);
    await expect(page.getByTestId("store-app")).toBeVisible();
    await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
    await expect(page.getByTestId("product-workbench")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "我的待办" })).toHaveCount(0);
  });

  test("operator navigation is exactly design/organization/operations/maintenance/links/account", async ({ page }) => {
    await stubStoreRoutes(page);
    await page.goto("/store");

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveText(["设计", "组织", "运营", "维护", "链接", "账号与地址"]);

    // 收敛前存在的面不再出现在导航里。
    for (const retired of ["秩序检索", "目录", "搜索", "公开上架", "运行态", "试拼沙箱", "订单工作台", "我的待办"]) {
      await expect(page.getByRole("tab", { name: retired })).toHaveCount(0);
    }

    // 六个块都能打开，且不出现参与者工作台的 testid。
    await page.getByRole("tab", { name: "设计" }).click();
    await expect(page.getByTestId("store-design-page")).toBeVisible();
    await page.getByRole("tab", { name: "组织" }).click();
    await expect(page.getByTestId("store-organization-page")).toBeVisible();
    await page.getByRole("tab", { name: "运营" }).click();
    await expect(page.getByTestId("store-operations-page")).toBeVisible();
    await page.getByRole("tab", { name: "维护" }).click();
    await expect(page.getByTestId("store-maintenance-page")).toBeVisible();
    await page.getByRole("tab", { name: "链接" }).click();
    await expect(page.getByTestId("store-link-page")).toBeVisible();
    await page.getByRole("tab", { name: /账号与地址/ }).click();
    await expect(page.getByTestId("store-account-page")).toBeVisible();

    await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
  });

  test("read-only Store session hides write controls and exposes no e2e bridge", async ({ page }) => {
    // 访问级别只认登录会话/环境配置；默认无配置即 anonymous_read。
    await stubStoreRoutes(page);
    await page.goto("/store");
    await expect(page.getByTestId("store-app")).toHaveAttribute("data-store-access", "anonymous_read");

    // 403 是写失败边界（后端强制，见 store_operator 专用跑批）；
    // UI 层的契约是只读会话不提供任何写入口。
    await expect(page.getByTestId("store-import-draft-button")).toHaveCount(0);

    // Store Console 的 E2E 注入桥已整体删除，window 上不应再有该桥。
    const bridge = await page.evaluate(() => {
      return (window as { __uvpStoreConsoleE2E?: unknown }).__uvpStoreConsoleE2E;
    });
    expect(bridge).toBeUndefined();
  });
});

async function stubStoreRoutes(page: Page): Promise<void> {
  // glob 锚定到桩 API origin，避免误拦 Vite 自身的模块请求
  await page.route(`${STUB_API_BASE}/store/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/store/session") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            authenticated: false,
            accessLevel: "anonymous_read",
            roles: ["anonymous_read"],
            capabilities: ["store.read"],
            authMode: "anonymous"
          }
        })
      });
      return;
    }
    if (pathname === "/store/zhixus") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceOfTruth: "contracts-and-chain-events",
          summary: {
            totalZhixus: 0,
            activeZhixus: 0,
            needsReview: 0,
            runningOrders: 0,
            openTasks: 0,
            registeredSuppliers: 0
          },
          zhixus: []
        })
      });
      return;
    }
    if (pathname === "/store/runtime/summary") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceOfTruth: "contracts-and-chain-events",
          activeZhixuCount: 0,
          runningOrderCount: 0,
          openTaskCount: 0,
          blockedOrderCount: 0,
          indexerStatus: "ready",
          updatedAt: "2026-09-01T00:00:00.000Z"
        })
      });
      return;
    }
    if (pathname === "/store/suppliers") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suppliers: [] }) });
      return;
    }
    if (pathname === "/store/join-applications") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ applications: [], scope: "viewer" }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
  });
}
