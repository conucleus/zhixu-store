import { expect, test } from "@playwright/test";
import { assertOrdinaryPageCopy, expectWorkbenchSource } from "./product-assertions";
import type { Page, TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

interface ProductWorkbenchStateSnapshot {
  readonly mode?: string | undefined;
  readonly view?: string | undefined;
  readonly sourceKind?: string | null | undefined;
  readonly apiBaseUrl?: string | null | undefined;
  readonly syncState?: string | null | undefined;
  readonly zhixuId?: string | null | undefined;
  readonly draftId?: string | null | undefined;
  readonly orderId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly evidenceId?: string | null | undefined;
  readonly submissionId?: string | null | undefined;
  readonly triggerTxHash?: string | null | undefined;
  readonly signalTxHash?: string | null | undefined;
}

const fullDependencyReason =
  "Full Product backend URL is not available to browser E2E. Run --mode full with the local stack harness or pass --chain-services-url.";

type FullFailedStage = "api" | "tx" | "indexer" | "playwright";

class FullFlowStageError extends Error {
  override readonly name = "FullFlowStageError";

  constructor(readonly failedStage: FullFailedStage, message: string) {
    super(message);
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Product Workbench full browser Product E2E @full", () => {
  test("happy path creates an order draft from a real catalog, saves it, and invites required participants", async ({ page }, testInfo) => {
    skipUnlessFullBackend();
    const closure: Partial<ProductWorkbenchStateSnapshot> = {};

    try {
      await page.goto("/app");
      await expectWorkbenchSource(page, "real");
      // staging Postgres-backed chain-services can take >8s for /product/tasks;
      // the fetch timeout is configurable via VITE_UVP_WORKBENCH_FETCH_TIMEOUT_MS.
      // 20s gives enough headroom without weakening the real-source gate.
      await expect(page.getByRole("heading", { name: "推荐秩序" })).toBeVisible({ timeout: 20_000 });
      await assertOrdinaryPageCopy(page);

      await page.getByTestId("catalog-detail-button").click();
      await expect(page.getByRole("heading", { name: /跨境高价值货物|秩序详情/ })).toBeVisible();
      await assertOrdinaryPageCopy(page);

      await page.getByTestId("zhixu-create-order-button").click();
      await expect(page.getByRole("heading", { name: "创建订单" })).toBeVisible();
      await fillCreateOrderForm(page);
      await page.getByTestId("create-draft-button").click();
      await expect(page.getByText("订单草稿已创建")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("product-workbench")).not.toHaveAttribute("data-uvp-draft-id", "");
      Object.assign(closure, {
        draftId: requireString(await workbenchAttribute(page, "data-uvp-draft-id"), "draftId")
      });

      await page.getByTestId("save-draft-button").click();
      await expect(page.getByText("草稿已保存")).toBeVisible({ timeout: 20_000 });
      await assertOrdinaryPageCopy(page);

      await page.getByTestId("next-participants-button").click();
      await expect(page.getByRole("heading", { name: "邀请参与方确认职责" })).toBeVisible();

      // 通过真实 UI 给每个未确认的关键参与方发送邀请；
      // 接受邀请必须由参与方本人完成，测试不再代替任何身份接受。
      const rows = page.getByTestId("participant-row");
      await expect(rows.first()).toBeVisible({ timeout: 20_000 });
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
      for (let index = 0; index < rowCount; index += 1) {
        const row = rows.nth(index);
        if ((await row.getAttribute("data-uvp-participant-status")) === "accepted") {
          continue;
        }
        await row.locator(".row-actions button").first().click();
        await expect(row.locator(".action-notice.success").first()).toBeVisible({ timeout: 20_000 });
      }

      // 没有真实参与方接受前，启动门槛必须保持关闭
      await expect(page.getByTestId("register-order-button")).toBeDisabled();
      await expect(page.getByText("当前订单无法启动")).toBeVisible();
    } catch (error) {
      const failedStage = error instanceof FullFlowStageError ? error.failedStage : "playwright";
      await writeFullFlowSummary({
        ...closure,
        success: false,
        failedStage,
        error: error instanceof Error ? error.message : String(error)
      }, testInfo);
      throw error;
    }
    await writeFullFlowSummary({ ...closure, success: true }, testInfo);
  });

  test("negative: missing participant blocks registration", async ({ page }) => {
    skipUnlessFullBackend();
    await openParticipantsWithoutAccepting(page);
    await expect(page.getByTestId("register-order-button")).toBeDisabled();
    await expect(page.getByText("仅当参与方清单已成功加载且所有关键参与方满足条件后，启动按钮才会可用。")).toBeVisible();
    await expect(page.getByText("当前订单无法启动")).toBeVisible();
  });

  test("negative: indexer syncing state remains visible", async ({ page }) => {
    skipUnlessFullBackend();
    if (!isBaseSepoliaRehearsal()) {
      test.skip(true, "syncing control flow requires base-sepolia rehearsal mode");
      return;
    }
    await page.goto("/app");
    await expectWorkbenchSource(page, "real");
    await expect(page.getByRole("heading", { name: "推荐秩序" })).toBeVisible({ timeout: 20_000 });
    const state = await productState(page);
    const apiBaseUrl = requireString(state.apiBaseUrl, "apiBaseUrl");
    expect(["ready", "syncing", null]).toContain(state.syncState ?? null);
    if (state.syncState === "syncing") {
      await expect(page.getByText("订单状态同步中").first()).toBeVisible();
    } else {
      await expect(page.getByTestId("product-workbench")).toHaveAttribute("data-uvp-source", "real");
    }
    await expectProductE2EControlsDisabled(page, apiBaseUrl);
  });
});

function skipUnlessFullBackend(): void {
  const mode = process.env.UVP_PRODUCT_BROWSER_E2E_MODE;
  test.skip(!(mode === "full" || mode === "base-sepolia" || mode === "testnet"), "full Product E2E only runs in --mode full/base-sepolia/testnet");
  if (!hasFullBackend()) {
    if (process.env.UVP_PRODUCT_BROWSER_E2E_REQUIRE_FULL === "1") {
      throw new FullFlowStageError("api", fullDependencyReason);
    }
    test.skip(true, fullDependencyReason);
  }
}

function hasFullBackend(): boolean {
  return Boolean(
    process.env.UVP_PRODUCT_BROWSER_E2E_CHAIN_SERVICES_URL ||
    process.env.VITE_UVP_CHAIN_SERVICES_URL ||
    process.env.UVP_PRODUCT_BROWSER_E2E_FULL_READY === "1"
  );
}

function isBaseSepoliaRehearsal(): boolean {
  const mode = process.env.UVP_PRODUCT_BROWSER_E2E_MODE;
  return mode === "base-sepolia" || mode === "testnet" || process.env.UVP_PRODUCT_BROWSER_E2E_BASE_SEPOLIA === "1";
}

async function expectProductE2EControlsDisabled(page: Page, apiBaseUrl?: string): Promise<void> {
  const resolvedApiBaseUrl = apiBaseUrl ?? requireString((await productState(page)).apiBaseUrl, "apiBaseUrl");
  const result = await page.evaluate(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/product/e2e/controls/syncing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    return { status: response.status, text: await response.text() };
  }, resolvedApiBaseUrl);
  expect(result.status).toBe(404);
  expect(result.text).toContain("not_found");
}

async function fillCreateOrderForm(page: Page): Promise<void> {
  await page.getByLabel(/订单名称/).fill("全流程 e2e 采购订单");
  await page.getByLabel(/业务类型/).fill("车辆");
  await page.getByLabel(/对象说明/).fill("Toyota Land Cruiser 300");
  await page.getByLabel(/总金额/).fill("10000");
  await page.getByLabel("币种").selectOption({ index: 0 });
}

async function openParticipantsWithoutAccepting(page: Page): Promise<void> {
  await page.goto("/app");
  await expectWorkbenchSource(page, "real");
  await page.getByTestId("catalog-detail-button").click();
  await expect(page.getByRole("heading", { name: /跨境高价值货物|秩序详情/ })).toBeVisible();
  await page.getByTestId("zhixu-create-order-button").click();
  await expect(page.getByRole("heading", { name: "创建订单" })).toBeVisible();
  await fillCreateOrderForm(page);
  await page.getByTestId("create-draft-button").click();
  await expect(page.getByTestId("product-workbench")).not.toHaveAttribute("data-uvp-draft-id", "");
  await page.getByTestId("save-draft-button").click();
  await expect(page.getByText("草稿已保存")).toBeVisible();
  await page.getByTestId("next-participants-button").click();
  await expect(page.getByRole("heading", { name: "邀请参与方确认职责" })).toBeVisible();
}

async function workbenchAttribute(page: Page, attribute: string): Promise<string> {
  return await page.getByTestId("product-workbench").getAttribute(attribute) ?? "";
}

async function productState(page: Page): Promise<ProductWorkbenchStateSnapshot> {
  return await page.evaluate(() => {
    const workbench = document.querySelector("[data-testid='product-workbench']");
    return {
      mode: workbench?.getAttribute("data-uvp-mode") ?? undefined,
      view: workbench?.getAttribute("data-uvp-view") ?? undefined,
      sourceKind: workbench?.getAttribute("data-uvp-source"),
      apiBaseUrl: workbench?.getAttribute("data-uvp-api-base-url"),
      syncState: workbench?.getAttribute("data-uvp-sync-state"),
      zhixuId: workbench?.getAttribute("data-uvp-zhixu-id"),
      draftId: workbench?.getAttribute("data-uvp-draft-id"),
      orderId: workbench?.getAttribute("data-uvp-order-id"),
      taskId: workbench?.getAttribute("data-uvp-task-id"),
      evidenceId: workbench?.getAttribute("data-uvp-evidence-id"),
      submissionId: workbench?.getAttribute("data-uvp-submission-id"),
      triggerTxHash: workbench?.getAttribute("data-uvp-trigger-tx-hash"),
      signalTxHash: workbench?.getAttribute("data-uvp-signal-tx-hash")
    };
  });
}

async function writeFullFlowSummary(summary: Partial<ProductWorkbenchStateSnapshot> & {
  readonly success?: boolean;
  readonly failedStage?: string;
  readonly error?: string;
}, testInfo: TestInfo): Promise<void> {
  const runRoot = process.env.UVP_STORE_E2E_RUN_ROOT;
  const body = Buffer.from(JSON.stringify({
    schemaVersion: "uvp-eth.store-product-workbench.full-flow.v2",
    testTitle: testInfo.title,
    generatedAt: new Date().toISOString(),
    ...summary
  }, null, 2));

  if (runRoot) {
    await mkdir(runRoot, { recursive: true });
    await writeFile(`${runRoot}/product-full-flow-summary.json`, body);
  }

  await testInfo.attach("product-full-flow-summary", {
    body,
    contentType: "application/json"
  });
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new FullFlowStageError("api", `${label} is missing`);
  }
  return value;
}
