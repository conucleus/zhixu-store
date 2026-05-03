import {
  expect,
  expectRecoverableTypedDataSignature,
  mockWalletAccount,
  smokeTypedData,
  test,
  writeRunScreenshot
} from "./mock-wallet";
import type { Page } from "@playwright/test";
import { assertOrdinaryPageCopy } from "./product-assertions";

test.describe("Product Workbench browser smoke", () => {
  test("fixture smoke renders catalog, order, and task pages without protocol jargon", async ({ page }, testInfo) => {
    await page.goto("/app?demo=1");
    await expect(page.getByTestId("participant-app-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的待办" })).toBeVisible();
    await expect(page.getByTestId("store-app")).toHaveCount(0);
    await page.getByRole("button", { name: "查看秩序库" }).click();
    await expect(page.getByRole("heading", { name: "把跨境订单拆成每个人看得懂的待办" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "推荐秩序" })).toBeVisible();
    await assertFixtureModeIfExpected(page);
    await assertOrdinaryPageCopy(page);
    await writeRunScreenshot(page, testInfo, "catalog-list");

    await page.getByRole("button", { name: "查看秩序详情" }).first().click();
    await expect(page.getByRole("heading", { name: /跨境高价值货物/ })).toBeVisible();
    await assertOrdinaryPageCopy(page);
    await writeRunScreenshot(page, testInfo, "zhixu-detail");

    await page.getByRole("button", { name: "用此秩序创建订单" }).first().click();
    await expect(page.getByRole("heading", { name: "创建跨境订单" })).toBeVisible();
    await assertOrdinaryPageCopy(page);
    await writeRunScreenshot(page, testInfo, "create-order");

    await page.getByRole("button", { name: "下一步" }).click();
    await expect(page.getByRole("heading", { name: "邀请参与方确认职责" })).toBeVisible();
    await assertOrdinaryPageCopy(page);
    await writeRunScreenshot(page, testInfo, "invite-participants");

    await page.getByRole("button", { name: /^订单$/ }).click();
    await expect(page.getByRole("heading", { name: /A 公司采购 10 台车辆/ })).toBeVisible();
    await expect(page.getByText("当前待办").first()).toBeVisible();
    await assertOrdinaryPageCopy(page);
    await writeRunScreenshot(page, testInfo, "order-overview");

    await page.getByRole("button", { name: /待办/ }).first().click();
    await expect(page.getByRole("heading", { name: "上传报关凭证" })).toBeVisible();
    await expect(page.getByRole("button", { name: "确认报关完成" })).toBeDisabled();
    await assertOrdinaryPageCopy(page);
    await writeRunScreenshot(page, testInfo, "task-detail");
  });

  test("mock EIP-1193 wallet signs recoverable typed data and supports rejection modes", async ({ page, mockWallet }) => {
    await page.goto("/app?demo=1");
    const typedData = smokeTypedData(mockWallet.address);

    const signature = await page.evaluate(
      async ({ address, payload }) => await window.ethereum.request({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(payload)]
      }) as string,
      { address: mockWallet.address, payload: typedData }
    );
    await expectRecoverableTypedDataSignature(signature, typedData);

    await mockWallet.setState({ chainId: "0x14a34" });
    await expect(page.evaluate(async () => await window.ethereum.request({ method: "eth_chainId" }))).resolves.toBe("0x14a34");

    await mockWallet.setState({ unauthorized: true });
    await expect(page.evaluate(async () => await window.ethereum.request({ method: "eth_accounts" }))).resolves.toEqual([]);
    await expectWalletError(page, "eth_signTypedData_v4", [mockWallet.address, JSON.stringify(typedData)], 4100);

    await mockWallet.setState({
      accounts: [mockWalletAccount.address],
      rejectSignTypedData: true,
      unauthorized: false
    });
    await expectWalletError(page, "eth_signTypedData_v4", [mockWallet.address, JSON.stringify(typedData)], 4001);
  });

  test("fixture smoke uploads evidence, signs through mock wallet, and confirms submission", async ({ page, mockWallet }, testInfo) => {
    await page.goto("/app?demo=1");
    await page.getByRole("button", { name: /待办/ }).first().click();

    await page.getByRole("button", { name: "上传开发样例凭证" }).click();
    await expect(page.getByText("凭证已上传，指纹已生成")).toBeVisible();
    await assertOrdinaryPageCopy(page);
    await writeRunScreenshot(page, testInfo, "evidence-upload");

    await page.getByRole("button", { name: "确认报关完成" }).click();
    await expect(page.getByRole("heading", { name: "确认报关完成 / 提交结果" })).toBeVisible();
    await page.getByRole("button", { name: "确认并提交" }).click();
    await expect(page.getByText("提交已确认，订单页稍后会同步最新状态")).toBeVisible({ timeout: 8_000 });

    const walletMethods = (await mockWallet.requestLog()).map((entry) => entry.method);
    expect(walletMethods).toContain("eth_requestAccounts");
    expect(walletMethods).toContain("eth_signTypedData_v4");
    await assertOrdinaryPageCopy(page);
    await writeRunScreenshot(page, testInfo, "submit-confirmed");
  });

  test("full mode shows diagnostic panel when /product/tasks returns 500, /product/me 403", async ({ page }) => {
    const apiBase = "http://127.0.0.1:9654";
    await page.route(`${apiBase}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/product/zhixus") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ zhixus: [] }) });
        return;
      }
      if (pathname === "/product/orders") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [] }) });
        return;
      }
      if (pathname === "/product/tasks") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Authentication timed out", errorCode: "internal_server_error" })
        });
        return;
      }
      if (pathname === "/product/me") {
        await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "forbidden" }) });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
    });

    await page.goto(`/app?productApiBase=${encodeURIComponent(apiBase)}`);
    await expect(page.getByTestId("workbench-diagnostic-panel")).toBeVisible();
    await expect(page.getByText("订单工作台无法加载")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-retry-button")).toBeVisible();

    // /product/tasks diagnostic row
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-status", "500");
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-error-code", "internal_server_error");

    // /product/me diagnostic row
    await expect(page.getByTestId("workbench-diagnostic-product-me")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-me")).toHaveAttribute("data-diagnostic-status", "403");
    await expect(page.getByTestId("workbench-diagnostic-product-me")).toHaveAttribute("data-diagnostic-error-code", "forbidden");

    // product-workbench element shows real source even during failure state
    await expect(page.getByTestId("product-workbench")).toHaveAttribute("data-uvp-source", "real");
    await expect(page.getByText("开发样例模式")).toHaveCount(0);

    // no demo fallback visible
    await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
  });

  test("loading shell exposes product-workbench with real source before data arrives", async ({ page }) => {
    const apiBase = "http://127.0.0.1:9655";
    // hold all responses so loading state stays visible
    let releaseZhixus!: () => void;
    const zhixusGate = new Promise<void>((resolve) => { releaseZhixus = resolve; });

    await page.route(`${apiBase}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/product/zhixus") {
        await zhixusGate;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ zhixus: [] }) });
        return;
      }
      await route.abort();
    });

    await page.goto(`/app?productApiBase=${encodeURIComponent(apiBase)}`);
    // loading shell must show product-workbench with real source immediately
    await expect(page.getByTestId("product-workbench")).toHaveAttribute("data-uvp-source", "real");
    await expect(page.getByText("正在加载订单工作台")).toBeVisible();

    // release the gate to clean up
    releaseZhixus();
  });

  test("full mode shows diagnostic panel before a delayed /product/tasks response completes", async ({ page }) => {
    test.slow();
    const apiBase = "http://127.0.0.1:9656";
    let delayedTasksResponseCompleted = false;
    await page.route(`${apiBase}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/product/zhixus") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ zhixus: [] }) });
        return;
      }
      if (pathname === "/product/orders") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [] }) });
        return;
      }
      if (pathname === "/product/tasks") {
        // Delay longer than the client timeout. The assertion below checks the
        // diagnostic renders before this delayed response is released, avoiding
        // fragile wall-clock comparisons under parallel browser load.
        await new Promise<void>((resolve) => setTimeout(resolve, 10000));
        delayedTasksResponseCompleted = true;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tasks: [] }) });
        return;
      }
      if (pathname === "/product/me") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ participant: { participantId: "test", displayName: "测试", roleLabels: [], source: "mock" } }) });
        return;
      }
      await route.abort();
    });

    const start = Date.now();
    await page.goto(`/app?productApiBase=${encodeURIComponent(apiBase)}`);
    // Diagnostic panel must appear before the delayed route is fulfilled, which
    // proves the 6s client timeout fired instead of waiting for the server.
    await expect(page.getByTestId("workbench-diagnostic-panel")).toBeVisible({ timeout: 9000 });
    expect(delayedTasksResponseCompleted).toBe(false);
    expect(Date.now() - start).toBeLessThan(10000);

    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-status", "0");
    await expect(page.getByText("请求超时")).toBeVisible();
  });

  test("full mode surfaces 503 product_storage_unavailable as diagnostic error code", async ({ page }) => {
    const apiBase = "http://127.0.0.1:9657";
    await page.route(`${apiBase}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/product/zhixus") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ zhixus: [] }) });
        return;
      }
      if (pathname === "/product/orders") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [] }) });
        return;
      }
      if (pathname === "/product/tasks") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "product_storage_unavailable", message: "Postgres connection refused", retryable: true })
        });
        return;
      }
      if (pathname === "/product/me") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ participant: { participantId: "test", displayName: "测试", roleLabels: [], source: "mock" } }) });
        return;
      }
      await route.abort();
    });

    await page.goto(`/app?productApiBase=${encodeURIComponent(apiBase)}`);
    await expect(page.getByTestId("workbench-diagnostic-panel")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-status", "503");
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-error-code", "product_storage_unavailable");
    // error code appears in the error-code column badge
    await expect(page.getByTestId("workbench-diagnostic-product-tasks").locator(".diagnostic-error-code")).toContainText("product_storage_unavailable");
  });

  test("full mode shows error state for non-diagnostic failures (no base URL)", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByTestId("workbench-diagnostic-panel")).toHaveCount(0);
    await expect(page.getByText("订单工作台加载失败")).toBeVisible();
  });

  test("fixture smoke surfaces wallet signature rejection without creating a submission", async ({ page, mockWallet }) => {
    await page.goto("/app?demo=1");
    await page.getByRole("button", { name: /待办/ }).first().click();
    await page.getByRole("button", { name: "上传开发样例凭证" }).click();
    await expect(page.getByText("凭证已上传，指纹已生成")).toBeVisible();
    await page.getByRole("button", { name: "确认报关完成" }).click();

    await mockWallet.setState({ rejectSignTypedData: true });
    await page.getByRole("button", { name: "确认并提交" }).click();
    await expect(page.getByText("你取消了签名，可以重新提交")).toBeVisible();
    await expect(page.getByText(/提交记录待创建/)).toBeVisible();
    await assertOrdinaryPageCopy(page);
  });
});

async function assertFixtureModeIfExpected(page: Page): Promise<void> {
  const mode = process.env.UVP_PRODUCT_BROWSER_E2E_MODE ?? "fixture";
  if (mode === "fixture" && !process.env.VITE_UVP_CHAIN_SERVICES_URL) {
    await expect(page.getByText("开发样例模式", { exact: true })).toBeVisible();
  }
}

async function expectWalletError(
  page: Page,
  method: string,
  params: unknown[],
  code: number
): Promise<void> {
  const result = await page.evaluate(async ({ requestMethod, requestParams }) => {
    try {
      await window.ethereum.request({ method: requestMethod, params: requestParams });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        code: typeof error === "object" && error !== null && "code" in error
          ? (error as { readonly code: unknown }).code
          : undefined
      };
    }
  }, { requestMethod: method, requestParams: params });
  expect(result).toEqual({ ok: false, code });
}
