import { expect, test } from "@playwright/test";
import { installWorkbenchRoutes, STUB_API_BASE } from "./workbench-stubs";

interface StoreConsoleE2EBridge {
  attemptImportDraft(): Promise<{ readonly ok: boolean; readonly status: number; readonly message: string }>;
}

declare global {
  interface Window {
    __uvpStoreConsoleE2E?: StoreConsoleE2EBridge;
  }
}

test.describe("Store and participant entry split", () => {
  test("/ defaults to /app", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId("participant-app-page")).toBeVisible();
  });

  test("/app loads the participant shell without Store Console controls", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.goto("/app");

    await expect(page.getByTestId("participant-app-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的待办" })).toBeVisible();
    await expect(page.getByTestId("store-app")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Store Console" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "导入草稿" })).toHaveCount(0);
  });

  test("/store loads the Store Console without participant task submission controls", async ({ page }) => {
    await stubStoreRoutes(page);
    await page.goto("/store");

    await expect(page.getByTestId("store-app")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Store Console" })).toBeVisible();
    await expect(page.getByRole("link", { name: "订单工作台" })).toHaveAttribute("href", "/app");
    await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
    await expect(page.getByTestId("task-confirm-button")).toHaveCount(0);
    await expect(page.getByTestId("submit-confirm-button")).toHaveCount(0);
  });

  test("unauthorized Store write attempt reports 403 without any session", async ({ page }) => {
    // 访问级别只认登录会话/环境配置；默认无配置即 anonymous_read。
    await stubStoreRoutes(page);
    await page.goto("/store");
    await expect(page.getByTestId("store-app")).toHaveAttribute("data-store-access", "anonymous_read");

    const result = await page.evaluate(async () => {
      const bridge = window.__uvpStoreConsoleE2E;
      if (!bridge) {
        throw new Error("store_console_e2e_bridge_missing");
      }
      return await bridge.attemptImportDraft();
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toContain("403");
  });
});

async function stubStoreRoutes(page: import("@playwright/test").Page): Promise<void> {
  await installWorkbenchRoutes(page);
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
        body: JSON.stringify({ activeZhixuCount: 0, runningOrderCount: 0, openTaskCount: 0 })
      });
      return;
    }
    if (pathname === "/store/suppliers") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suppliers: [] }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
  });
}
