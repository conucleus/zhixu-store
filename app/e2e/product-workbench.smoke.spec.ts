import { expect, test } from "@playwright/test";
import { assertOrdinaryPageCopy } from "./product-assertions";
import { installWorkbenchRoutes, STUB_API_BASE, stubZhixu, stubParticipant } from "./workbench-stubs";

test.describe("Product Workbench browser smoke", () => {
  test("renders catalog, order, and task pages against stubbed product API", async ({ page }, testInfo) => {
    await installWorkbenchRoutes(page);
    await page.goto("/app");
    await expect(page.getByTestId("participant-app-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的待办" })).toBeVisible();
    await expect(page.getByTestId("store-app")).toHaveCount(0);
    await page.getByRole("button", { name: "查看秩序库" }).click();
    await expect(page.getByRole("heading", { name: "把跨境订单拆成每个人看得懂的待办" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "推荐秩序" })).toBeVisible();
    await assertOrdinaryPageCopy(page);

    await page.getByRole("button", { name: "查看秩序详情" }).first().click();
    await expect(page.getByRole("heading", { name: /跨境高价值货物/ })).toBeVisible();
    await assertOrdinaryPageCopy(page);

    await page.getByRole("button", { name: "用此秩序创建订单" }).first().click();
    await expect(page.getByRole("heading", { name: "创建跨境订单" })).toBeVisible();
    await assertOrdinaryPageCopy(page);

    await page.getByTestId("next-participants-button").click();
    await expect(page.getByText("请先在「订单信息」页填写并创建订单草稿")).toBeVisible();

    await page.getByRole("button", { name: /^订单$/ }).click();
    await expect(page.getByRole("heading", { name: /测试采购订单/ })).toBeVisible();
    await expect(page.getByText("当前待办").first()).toBeVisible();
    await assertOrdinaryPageCopy(page);

    await page.getByRole("button", { name: /待办/ }).first().click();
    await expect(page.getByRole("heading", { name: "上传报关凭证" })).toBeVisible();
    await expect(page.getByTestId("task-confirm-button")).toBeDisabled();
    // 身份来自 /product/me 桩，页面展示确认后的身份而不是反推文案
    await expect(page.getByText("测试报关行操作员").first()).toBeVisible();
  });

  test("create order form reports missing required fields by name, then creates a draft", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.goto("/app");
    await page.getByRole("button", { name: "查看秩序详情" }).first().click();
    await page.getByTestId("zhixu-create-order-button").click();
    await expect(page.getByRole("heading", { name: "创建跨境订单" })).toBeVisible();

    await page.getByTestId("create-draft-button").click();
    await expect(page.getByText(`请填写必填字段：订单名称、标的物类型、品牌型号、总金额、币种`)).toBeVisible();

    await page.getByLabel(/订单名称/).fill("e2e 受控表单订单");
    await page.getByRole("button", { name: "车辆" }).click();
    await page.getByLabel(/^品牌型号/).fill("测试车型 X1");
    await page.getByLabel(/数量/).fill("2");
    await page.getByLabel(/总金额/).fill("10000");
    await page.getByLabel("币种").selectOption("USDC");
    await page.getByLabel("出口国家/地区").fill("中国");
    await page.getByLabel("目的国家/地区").fill("阿联酋");
    await page.getByLabel("预计完成日期").fill("2026-07-31");

    await page.getByTestId("create-draft-button").click();
    await expect(page.getByText("订单草稿已创建")).toBeVisible();
    await expect(page.getByTestId("product-workbench")).not.toHaveAttribute("data-uvp-draft-id", "");

    await page.getByTestId("save-draft-button").click();
    await expect(page.getByText("草稿已保存")).toBeVisible();
  });

  test("uploads real evidence file and fails closed when no browser wallet is connected", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.goto("/app");
    await page.getByRole("button", { name: /待办/ }).first().click();
    await expect(page.getByTestId("task-detail-page")).toBeVisible();
    await expect(page.getByText("尚未上传凭证")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "出口报关单.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e evidence")
    });
    await expect(page.getByText("凭证已上传，指纹已生成")).toBeVisible();

    await page.getByTestId("task-confirm-button").click();
    await expect(page.getByRole("heading", { name: "确认报关完成 / 提交结果" })).toBeVisible();
    await page.getByTestId("submit-confirm-button").click();
    // 无 ethereum provider 时必须 fail-closed：不生成提交记录
    await expect(page.getByText("请连接浏览器钱包后再确认提交")).toBeVisible();
    await expect(page.getByText(/提交记录待创建/)).toBeVisible();
    await assertOrdinaryPageCopy(page);
  });

  test("shows diagnostic panel when /product/tasks returns 500 and /product/me 403", async ({ page }) => {
    await installWorkbenchRoutes(page, {
      overrides: {
        "/product/tasks": {
          status: 500,
          body: { error: "Authentication timed out", errorCode: "internal_server_error" }
        },
        "/product/me": {
          status: 403,
          body: { error: "forbidden" }
        }
      }
    });
    await page.goto("/app");
    await expect(page.getByTestId("workbench-diagnostic-panel")).toBeVisible();
    await expect(page.getByText("订单工作台无法加载")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-retry-button")).toBeVisible();

    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-status", "500");
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-error-code", "internal_server_error");

    await expect(page.getByTestId("workbench-diagnostic-product-me")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-me")).toHaveAttribute("data-diagnostic-status", "403");
    await expect(page.getByTestId("workbench-diagnostic-product-me")).toHaveAttribute("data-diagnostic-error-code", "forbidden");

    await expect(page.getByTestId("product-workbench")).toHaveAttribute("data-uvp-source", "real");
    await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
  });

  test("loading shell exposes product-workbench with real source before data arrives", async ({ page }) => {
    let releaseZhixus!: () => void;
    const zhixusGate = new Promise<void>((resolve) => { releaseZhixus = resolve; });

    await page.route(`${STUB_API_BASE}/product/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/product/zhixus") {
        // 挂起目录响应，保持 loading 状态可见
        await zhixusGate;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ zhixus: [] }) });
        return;
      }
      await route.abort();
    });

    await page.goto("/app");
    await expect(page.getByTestId("product-workbench")).toHaveAttribute("data-uvp-source", "real");
    await expect(page.getByText("正在加载订单工作台")).toBeVisible();

    releaseZhixus();
  });

  test("full mode shows diagnostic panel before a delayed /product/tasks response completes", async ({ page }) => {
    test.slow();
    let delayedTasksResponseCompleted = false;
    await page.route(`${STUB_API_BASE}/product/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/product/zhixus") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ zhixus: [stubZhixu] }) });
        return;
      }
      if (pathname === "/product/orders") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [] }) });
        return;
      }
      if (pathname === "/product/tasks") {
        // 延迟超过客户端 6s 超时：诊断面板应先于该响应出现
        await new Promise<void>((resolve) => setTimeout(resolve, 10000));
        delayedTasksResponseCompleted = true;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tasks: [] }) });
        return;
      }
      if (pathname === "/product/me") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ participant: stubParticipant })
        });
        return;
      }
      await route.abort();
    });

    const start = Date.now();
    await page.goto("/app");
    await expect(page.getByTestId("workbench-diagnostic-panel")).toBeVisible({ timeout: 9000 });
    expect(delayedTasksResponseCompleted).toBe(false);
    expect(Date.now() - start).toBeLessThan(10000);

    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-status", "0");
    await expect(page.getByText("请求超时")).toBeVisible();
  });

  test("full mode surfaces 503 product_storage_unavailable as diagnostic error code", async ({ page }) => {
    await installWorkbenchRoutes(page, {
      overrides: {
        "/product/tasks": {
          status: 503,
          body: { error: "product_storage_unavailable", message: "Postgres connection refused", retryable: true }
        }
      }
    });
    await page.goto("/app");
    await expect(page.getByTestId("workbench-diagnostic-panel")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toBeVisible();
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-status", "503");
    await expect(page.getByTestId("workbench-diagnostic-product-tasks")).toHaveAttribute("data-diagnostic-error-code", "product_storage_unavailable");
    await expect(page.getByTestId("workbench-diagnostic-product-tasks").locator(".diagnostic-error-code")).toContainText("product_storage_unavailable");
  });

  test("unrouted product requests fail closed with an explicit error state", async ({ page }) => {
    // VITE_UVP_CHAIN_SERVICES_URL 指向不可达地址且无路由桩：网络失败必须显式报错，
    // 不回退到任何本地样例数据。
    await page.goto("/app");
    await expect(page.getByTestId("workbench-diagnostic-panel")).toHaveCount(0);
    await expect(page.getByText("订单工作台加载失败")).toBeVisible();
  });
});
