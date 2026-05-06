import { expect, test } from "./mock-wallet";

test.describe("Store Phase 0 internal alpha baseline", () => {
  test("fixture Store opens search, detail, suppliers, and runtime with chain-boundary copy", async ({ page }) => {
    await page.goto("/store?storeDemo=1&storeAccess=read");

    await expect(page.getByTestId("store-app")).toHaveAttribute("data-store-access", "store_read");
    await expect(page.getByText("Store 开发样例模式", { exact: true })).toBeVisible();
    await expect(page.getByTestId("store-search-page")).toBeVisible();
    await expect(page.getByText("当前为只读访问，导入、供应商标签、试拼草稿保存等写按钮已隐藏。")).toBeVisible();
    await expect(page.getByTestId("store-import-draft-button")).toHaveCount(0);
    await expect(page.getByTestId("store-open-docking-button")).toHaveCount(0);

    await page.getByTestId("store-open-zhixu-button").first().click();
    await expect(page.getByTestId("store-zhixu-detail-page")).toBeVisible();
    const detailPage = page.getByTestId("store-zhixu-detail-page");
    await expect(page.getByText("维护方", { exact: true })).toBeVisible();
    await expect(page.getByText("版本", { exact: true })).toBeVisible();
    await expect(page.getByText("风险等级", { exact: true })).toBeVisible();
    await expect(detailPage.locator(".store-ops-row").getByText("背书", { exact: true })).toBeVisible();
    await expect(detailPage.locator(".store-ops-row").getByText("订单", { exact: true })).toBeVisible();
    await expect(detailPage.locator(".store-ops-row").getByText("供应商", { exact: true })).toBeVisible();
    await expect(page.getByText("链上事实来自 Trust Registry 和 StateMachine 投影。")).toBeVisible();
    await expect(page.getByText("只读访问不显示试拼保存、导入和版本操作。")).toBeVisible();

    await page.getByText("高级标识").click();
    await expect(page.getByText("Plan ID", { exact: true })).toBeVisible();
    await expect(page.getByText("Plan Hash", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /高级链上证明/ }).click();
    await expect(page.getByText("秩序编号", { exact: true })).toBeVisible();
    await expect(page.getByText("生命周期", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "返回秩序检索" }).click();
    await page.getByRole("tab", { name: "供应商" }).click();
    await expect(page.getByTestId("store-supplier-page")).toBeVisible();
    await expect(page.getByTestId("store-edit-supplier-tags-button")).toHaveCount(0);
    await expect(page.getByText("当前只读访问，不显示供应商标签编辑按钮。")).toBeVisible();

    await page.getByRole("tab", { name: "运行态" }).click();
    await expect(page.getByTestId("store-runtime-page")).toBeVisible();
    await expect(page.getByText("订单和待办从 StateMachine 事件投影")).toBeVisible();
    await expect(page.getByText("计划和供应商背书从 Trust Registry 投影")).toBeVisible();
  });

  test("operator mode exposes draft and docking entrypoints without publishing copy", async ({ page }) => {
    await page.goto("/store?storeDemo=1&storeAccess=operator");

    await expect(page.getByTestId("store-app")).toHaveAttribute("data-store-access", "store_operator");
    await expect(page.getByTestId("store-search-page")).toBeVisible();
    await expect(page.getByTestId("store-open-docking-button")).toBeVisible();
    await expect(page.getByTestId("store-import-draft-button")).toBeVisible();
    await expect(page.getByText("导入只创建 Store 草稿，不编译、不审核、不发布。")).toBeVisible();

    await page.getByTestId("store-open-docking-button").click();
    await expect(page.getByTestId("store-docking-page")).toBeVisible();
    await expect(page.getByText("只创建非发布草稿，用来检查两个秩序之间的信号接口是否能对齐。")).toBeVisible();
    await expect(page.getByTestId("store-create-docking-session-button")).toBeVisible();
    await expect(page.getByText("试拼已发布")).toHaveCount(0);
  });

  test("Store fails closed without explicit demo selection or API base URL", async ({ page }) => {
    await page.goto("/store");

    await expect(page.getByTestId("store-app")).toBeVisible();
    await expect(page.getByText("Store 开发样例模式", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "秩序商店加载失败" })).toBeVisible();
    await expect(page.getByText("Store API base URL is not configured")).toBeVisible();
  });

  test("Store keeps real API errors visible when demo is selected with a configured API base", async ({ page }) => {
    const apiBase = "http://127.0.0.1:9665";
    await page.route(`${apiBase}/**`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "store_projection_unavailable", message: "projection store unavailable" })
      });
    });

    await page.goto(`/store?storeDemo=1&storeApiBase=${encodeURIComponent(apiBase)}`);

    await expect(page.getByTestId("store-app")).toBeVisible();
    await expect(page.getByText("Store 开发样例模式", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "秩序商店加载失败" })).toBeVisible();
    await expect(page.getByText("503：store_projection_unavailable")).toBeVisible();
  });
});
