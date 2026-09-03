import { expect, test } from "@playwright/test";
import { assertOrdinaryPageCopy } from "./product-assertions";
import { installWorkbenchRoutes, STUB_API_BASE, stubFallbackTask, stubTask, stubZhixu, stubParticipant } from "./workbench-stubs";

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
    await expect(page.getByRole("heading", { name: "上传阶段凭证" })).toBeVisible();
    await expect(page.getByTestId("task-confirm-button")).toBeDisabled();
    // 身份来自 /product/me 桩，页面展示确认后的身份而不是反推文案
    await expect(page.getByText("测试报关行操作员").first()).toBeVisible();
  });

  test("opens each task card's own detail instead of always the projected active task", async ({ page }) => {
    const secondTask = {
      ...stubTask,
      taskId: "task-2002",
      title: "第二张待办：国际运输",
      stageId: "stage-delivery",
      stageName: "国际运输"
    };
    await installWorkbenchRoutes(page, {
      overrides: {
        "/product/tasks": { body: { tasks: [stubTask, secondTask] } }
      }
    });
    await page.goto("/app");
    await expect(page.getByTestId("participant-app-page")).toBeVisible();

    // 点第二张待办卡：打开的是该卡片自己的任务，而不是投影选中的第一个待办
    await page.getByTestId("participant-task-open-task-2002").click();
    await expect(page.getByTestId("task-detail-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "第二张待办：国际运输" })).toBeVisible();
    await expect(page.getByTestId("product-workbench")).toHaveAttribute("data-uvp-task-id", "task-2002");
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
    await expect(page.getByText("尚未上传「报关单 PDF」")).toBeVisible();

    // 未填必填字段时先拦截：凭证元数据会随上传进入指纹，缺字段不允许上传
    await page.getByTestId("task-file-input-customs_declaration_pdf").setInputFiles({
      name: "出口报关单.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e evidence")
    });
    await expect(page.getByText("请填写必填字段：报关单号、出口港口、完成时间")).toBeVisible();
    await expect(page.getByText("尚未上传「报关单 PDF」")).toBeVisible();

    // 字段来自凝结核配置（演示配置数据），框架不预置任何业务字段
    await page.getByTestId("task-field-customs_declaration_no").fill("2026-001234");
    await page.getByTestId("task-field-export_port").fill("洋山港");
    await page.getByTestId("task-field-completion_date").fill("2026-08-01");

    await page.getByTestId("task-file-input-customs_declaration_pdf").setInputFiles({
      name: "出口报关单.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e evidence")
    });
    await expect(page.getByText("凭证已上传，指纹已生成")).toBeVisible();

    await page.getByTestId("task-confirm-button").click();
    await expect(page.getByRole("heading", { name: "确认阶段完成 / 提交结果" })).toBeVisible();
    // 所见即所签：确认页列出全部已上传证据的槽位名与指纹
    await expect(page.getByTestId("submit-fingerprint-list")).toContainText("报关单 PDF");
    await page.getByTestId("submit-confirm-button").click();
    // 无 ethereum provider 时必须 fail-closed：不生成提交记录
    await expect(page.getByText("请连接浏览器钱包后再确认提交")).toBeVisible();
    await expect(page.getByText(/提交记录待创建/)).toBeVisible();
    await assertOrdinaryPageCopy(page);
  });

  test("blocks submit after fields change post-upload until the evidence is re-uploaded", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.goto("/app");
    await page.getByRole("button", { name: /待办/ }).first().click();
    await expect(page.getByTestId("task-detail-page")).toBeVisible();

    await page.getByTestId("task-field-customs_declaration_no").fill("2026-001234");
    await page.getByTestId("task-field-export_port").fill("洋山港");
    await page.getByTestId("task-field-completion_date").fill("2026-08-01");
    const pdf = {
      name: "出口报关单.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e evidence")
    };
    await page.getByTestId("task-file-input-customs_declaration_pdf").setInputFiles(pdf);
    await expect(page.getByText("凭证已上传，指纹已生成")).toBeVisible();
    await expect(page.getByTestId("task-confirm-button")).toBeEnabled();

    // 上传后改动字段：指纹已分叉，fail-closed 禁止提交并显著提示
    await page.getByTestId("task-field-export_port").fill("深圳港");
    await expect(page.getByTestId("task-evidence-stale-warning")).toBeVisible();
    await expect(page.getByTestId("task-confirm-button")).toBeDisabled();

    // 重新上传刷新指纹后解锁
    await page.getByTestId("task-file-input-customs_declaration_pdf").setInputFiles(pdf);
    await expect(page.getByTestId("task-evidence-stale-warning")).toHaveCount(0);
    await expect(page.getByTestId("task-confirm-button")).toBeEnabled();
  });

  test("rejects non-PDF, forged-PDF and oversized evidence files before upload", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.goto("/app");
    await page.getByRole("button", { name: /待办/ }).first().click();
    await expect(page.getByTestId("task-detail-page")).toBeVisible();

    await page.getByTestId("task-field-customs_declaration_no").fill("2026-001234");
    await page.getByTestId("task-field-export_port").fill("洋山港");
    await page.getByTestId("task-field-completion_date").fill("2026-08-01");

    await page.getByTestId("task-file-input-customs_declaration_pdf").setInputFiles({
      name: "现场照片.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("not a pdf")
    });
    await expect(page.getByText("仅支持 PDF 格式的凭证文件")).toBeVisible();

    // STORE-02：MIME/扩展名伪造绕不过 %PDF- 首字节快检
    await page.getByTestId("task-file-input-customs_declaration_pdf").setInputFiles({
      name: "伪造.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("MZ fake pdf content")
    });
    await expect(page.getByText(/文件内容不是有效的 PDF/)).toBeVisible();

    await page.getByTestId("task-file-input-customs_declaration_pdf").setInputFiles({
      name: "超大报关单.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0)
    });
    await expect(page.getByText("凭证文件超过 10MB，请压缩或拆分后再上传")).toBeVisible();
    await expect(page.getByText("尚未上传「报关单 PDF」")).toBeVisible();
  });

  test("degrades spec-less tasks into a generic upload slot without rejecting declared evidence", async ({ page }) => {
    await installWorkbenchRoutes(page, {
      overrides: {
        "/product/tasks": {
          body: { tasks: [stubFallbackTask] }
        }
      }
    });
    await page.goto("/app");
    await page.getByRole("button", { name: /待办/ }).first().click();
    await expect(page.getByTestId("task-detail-page")).toBeVisible();

    // 旧 requiredEvidence 字符串原样展示，不拒绝也不丢弃
    await expect(page.getByText("本待办需要的凭证：质检单、物流回单")).toBeVisible();
    await expect(page.getByText("本待办没有结构化证据配置")).toBeVisible();

    // 通用槽位不限格式：商店不含任何业务格式特判
    await page.getByTestId("task-file-input-task_evidence_generic").setInputFiles({
      name: "回单.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("fallback slot accepts any file")
    });
    await expect(page.getByText("凭证已上传，指纹已生成")).toBeVisible();
    await expect(page.getByTestId("product-workbench")).not.toHaveAttribute("data-uvp-evidence-id", "");
  });

  test("submits a file-free task through pure field confirmation without requiring uploads", async ({ page }) => {
    const textOnlyTask = {
      ...stubTask,
      taskId: "task-2003-textonly",
      title: "纯字段待办：补充说明",
      requiredEvidence: ["完成时间"],
      evidenceSpec: [
        { key: "completion_date", label: "完成时间", inputKind: "date" as const, required: true },
        { key: "remark", label: "备注说明", inputKind: "text" as const, required: false }
      ]
    };
    await installWorkbenchRoutes(page, {
      overrides: {
        "/product/tasks": { body: { tasks: [textOnlyTask] } }
      }
    });
    await page.goto("/app");
    await page.getByRole("button", { name: /待办/ }).first().click();
    await expect(page.getByTestId("task-detail-page")).toBeVisible();
    await expect(page.getByText("本待办无需上传文件凭证")).toBeVisible();

    // 必填字段未填时按钮仍锁，且如实提示缺什么
    await expect(page.getByTestId("task-confirm-button")).toBeDisabled();
    await expect(page.getByTestId("task-confirm-blocked-note")).toContainText("完成时间");

    await page.getByTestId("task-field-completion_date").fill("2026-09-01");
    await expect(page.getByTestId("task-confirm-button")).toBeEnabled();
    await page.getByTestId("task-confirm-button").click();

    // 确认页如实呈现纯字段提交：无文件凭证，不再要求指纹
    await expect(page.getByTestId("submit-page")).toBeVisible();
    await expect(page.getByText("无文件凭证（本次提交为纯字段确认）")).toBeVisible();
    await expect(page.getByTestId("submit-confirm-button")).toBeEnabled();
    await page.getByTestId("submit-confirm-button").click();
    // 无钱包时仍 fail-closed：不产生提交记录
    await expect(page.getByText("请连接浏览器钱包后再确认提交")).toBeVisible();
  });

  test("create-order form keeps unsaved values across view switches", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.goto("/app");
    await page.getByRole("button", { name: "查看秩序库" }).click();
    await page.getByRole("button", { name: "查看秩序详情" }).first().click();
    await page.getByTestId("zhixu-create-order-button").click();
    await expect(page.getByRole("heading", { name: "创建跨境订单" })).toBeVisible();

    await page.getByLabel(/订单名称/).fill("切换视图不丢字段订单");
    await page.getByRole("button", { name: "车辆" }).click();
    await page.getByLabel(/^品牌型号/).fill("Persisted Model X");
    await page.getByLabel(/数量/).fill("3");
    await page.getByLabel(/VIN/).fill("LVG123456789012345");
    await page.getByLabel(/备注/).fill("视图切换前录入的备注");

    // 切走再切回：组件被卸载重建，未保存的输入必须保留
    await page.getByRole("button", { name: /^订单$/ }).click();
    await expect(page.getByRole("heading", { name: /测试采购订单/ })).toBeVisible();
    await page.getByRole("button", { name: "秩序库" }).click();
    await page.getByRole("button", { name: "查看秩序详情" }).first().click();
    await page.getByTestId("zhixu-create-order-button").click();
    await expect(page.getByRole("heading", { name: "创建跨境订单" })).toBeVisible();

    await expect(page.getByLabel(/订单名称/)).toHaveValue("切换视图不丢字段订单");
    await expect(page.getByRole("button", { name: "车辆" })).toHaveClass(/is-active/);
    await expect(page.getByLabel(/^品牌型号/)).toHaveValue("Persisted Model X");
    await expect(page.getByLabel(/数量/)).toHaveValue("3");
    await expect(page.getByLabel(/VIN/)).toHaveValue("LVG123456789012345");
    await expect(page.getByLabel(/备注/)).toHaveValue("视图切换前录入的备注");
  });

  test("dispute page presents the unopened channel honestly without fabricated SLA steps", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.goto("/app");
    await page.getByRole("button", { name: /^订单$/ }).click();
    await expect(page.getByRole("heading", { name: /测试采购订单/ })).toBeVisible();
    await page.getByRole("button", { name: "提出争议" }).first().click();
    await expect(page.getByRole("heading", { name: /对出口报关凭证提出争议/ })).toBeVisible();

    // 未接入的事实必须如实呈现
    await expect(page.getByTestId("dispute-channel-status")).toBeVisible();
    await expect(page.getByText("争议提交通道尚未开通").first()).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("平台已通知");
    expect(bodyText).not.toContain("平台裁定");
    expect(bodyText).not.toContain("个工作日");
    expect(bodyText).not.toContain("争议处理时间线");

    // 提交仍 fail-closed：不产生任何记录
    await page.getByRole("button", { name: "提交争议" }).click();
    await expect(page.locator(".action-notice.error")).toContainText("争议提交未接入后端，未产生任何记录");
  });

  test("keeps the workbench usable when one zhixu detail fails while others succeed", async ({ page }) => {
    const zhixuB = { ...stubZhixu, zhixuId: "zhixu-cross-border-high-value-b", title: "备用履约秩序" };
    await installWorkbenchRoutes(page, {
      overrides: {
        // 失败的秩序详情 404；存活的详情显式给桩，避免被列表前缀覆盖
        "/product/zhixus/zhixu-cross-border-high-value-b": {
          status: 404,
          body: { error: "not_found" }
        },
        "/product/zhixus/zhixu-cross-border-high-value": {
          body: { zhixu: stubZhixu }
        },
        "/product/zhixus": {
          body: {
            zhixus: [stubZhixu, zhixuB]
          }
        }
      }
    });
    await page.goto("/app");

    // 整体不进入诊断错误页：待办、订单仍然可用
    await expect(page.getByTestId("participant-app-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的待办" })).toBeVisible();
    await expect(page.getByText(/1 个接口加载失败/)).toBeVisible();

    // 存活的秩序详情仍可打开
    await page.getByRole("button", { name: "查看秩序库" }).click();
    await expect(page.getByRole("heading", { name: /跨境高价值货物/ })).toBeVisible();
    await expect(page.getByText("备用履约秩序")).toHaveCount(0);
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
