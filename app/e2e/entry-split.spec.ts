import { expect, test } from "./mock-wallet";

interface StoreConsoleE2EBridge {
  attemptImportDraft(): Promise<{ readonly ok: boolean; readonly status: number; readonly message: string }>;
}

declare global {
  interface Window {
    __uvpStoreConsoleE2E?: StoreConsoleE2EBridge;
  }
}

test.describe("Store and participant entry split", () => {
  test("/ defaults to /app unless Store operator mode is explicit", async ({ page }) => {
    await page.goto("/?demo=1");
    await expect(page).toHaveURL(/\/app\?demo=1$/);
    await expect(page.getByTestId("participant-app-page")).toBeVisible();

    await page.goto("/?storeDemo=1&storeAccess=operator");
    await expect(page).toHaveURL(/\/store\?storeDemo=1&storeAccess=operator$/);
    await expect(page.getByTestId("store-app")).toBeVisible();
  });

  test("/app loads the participant shell without Store Console controls", async ({ page }) => {
    await page.goto("/app?demo=1");

    await expect(page.getByTestId("participant-app-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的待办" })).toBeVisible();
    await expect(page.getByTestId("store-app")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Store Console" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "导入草稿" })).toHaveCount(0);
  });

  test("/store loads the Store Console without participant task submission controls", async ({ page }) => {
    await page.goto("/store?storeDemo=1");

    await expect(page.getByTestId("store-app")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Store Console" })).toBeVisible();
    await expect(page.getByRole("link", { name: "订单工作台" })).toHaveAttribute("href", /\/app$/);
    await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
    await expect(page.getByTestId("task-confirm-button")).toHaveCount(0);
    await expect(page.getByTestId("submit-confirm-button")).toHaveCount(0);
  });

  test("explicit demo banners stay under their selected entry", async ({ page }) => {
    await page.goto("/store?storeDemo=1");
    await expect(page.getByText("Store 开发样例模式", { exact: true })).toBeVisible();
    await expect(page.getByText("开发样例模式", { exact: true })).toHaveCount(0);

    await page.goto("/app?demo=1");
    await expect(page.getByText("开发样例模式", { exact: true })).toBeVisible();
    await expect(page.getByText("Store 开发样例模式", { exact: true })).toHaveCount(0);
  });

  test("unauthorized Store write attempt reports 403", async ({ page }) => {
    await page.goto("/store?storeDemo=1&storeAccess=anonymous");
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
