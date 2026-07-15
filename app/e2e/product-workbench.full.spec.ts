import { expect, test, writeRunScreenshot } from "./mock-wallet";
import { assertOrdinaryPageCopy, expectWorkbenchSource } from "./product-assertions";
import type { Page, TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

interface ProductWorkbenchE2EState {
  readonly mode?: string;
  readonly view?: string;
  readonly loadStatus?: string;
  readonly sourceKind?: "mock" | "real" | null;
  readonly apiBaseUrl?: string | null;
  readonly syncState?: string | null;
  readonly zhixuId?: string | null;
  readonly draftId?: string | null;
  readonly triggerId?: string | null;
  readonly orderId?: string | null;
  readonly taskId?: string | null;
  readonly evidenceId?: string | null;
  readonly submissionId?: string | null;
  readonly triggerTxHash?: string | null;
  readonly signalTxHash?: string | null;
  readonly projection?: ProductProjectionSummary;
  readonly proof?: ProductProofSummary;
}

interface ProductProjectionSummary {
  readonly syncStatus?: string;
  readonly latestIndexedBlock?: string;
  readonly finalizedBlock?: string;
  readonly confirmationDepth?: number;
  readonly eventCount?: number;
  readonly rebuildStatus?: string;
}

interface ProductProofSummary {
  readonly timelineEventCount: number;
  readonly proofEventCount: number;
  readonly transactionHashes: readonly string[];
  readonly blockNumbers: readonly string[];
  readonly hasTriggerProof: boolean;
  readonly hasSignalProof: boolean;
}

interface AcceptParticipantsResult {
  readonly acceptedCount: number;
  readonly missingRequired: number;
  readonly draftId?: string;
  readonly draftStatus?: string;
}

declare global {
  interface Window {
    readonly __uvpProductWorkbenchE2E?: {
      readonly state: ProductWorkbenchE2EState;
      acceptRequiredParticipants(walletAddresses: string | readonly string[]): Promise<AcceptParticipantsResult>;
    };
  }
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
  test("happy path creates an order, registers it, submits evidence, and records proof", async ({ page, mockWallet }, testInfo) => {
    skipUnlessFullBackend();
    test.setTimeout(Number(process.env.UVP_PRODUCT_E2E_HAPPY_PATH_TIMEOUT_MS ?? "600000"));
    const closure: Partial<ProductWorkbenchE2EState> = {};

    try {
      await page.goto("/app");
      await expectWorkbenchSource(page, "real");
      // staging Postgres-backed chain-services can take >8s for /product/tasks;
      // the fetch timeout is configurable via VITE_UVP_WORKBENCH_FETCH_TIMEOUT_MS.
      // 20s gives enough headroom without weakening the real-source gate.
      await expect(page.getByRole("heading", { name: "推荐秩序" })).toBeVisible({ timeout: 20_000 });
      const initialState = await productState(page);
      const apiBaseUrl = requireString(initialState.apiBaseUrl, "apiBaseUrl");
      await assertOrdinaryPageCopy(page);
      await writeRunScreenshot(page, testInfo, "full-catalog-list");

      await page.getByTestId("catalog-detail-button").click();
      await expect(page.getByRole("heading", { name: /跨境高价值货物/ })).toBeVisible();
      await assertOrdinaryPageCopy(page);
      await writeRunScreenshot(page, testInfo, "full-zhixu-detail");

      await page.getByTestId("zhixu-create-order-button").click();
      await expect(page.getByRole("heading", { name: "创建跨境订单" })).toBeVisible();
      await page.getByTestId("create-draft-button").click();
      await expect(page.getByTestId("product-workbench")).not.toHaveAttribute("data-uvp-draft-id", "");
      await page.getByTestId("save-draft-button").click();
      rememberState(closure, await productState(page));
      await assertOrdinaryPageCopy(page);
      await writeRunScreenshot(page, testInfo, "full-create-order");

      await page.getByTestId("next-participants-button").click();
      await expect(page.getByRole("heading", { name: "邀请参与方确认职责" })).toBeVisible();
      const participantResult = await acceptRequiredParticipants(page, requiredParticipantWallets(mockWallet.address));
      expect(participantResult.missingRequired).toBe(0);
      await expect(page.getByTestId("register-order-button")).toBeEnabled();
      await writeRunScreenshot(page, testInfo, "full-invite-participants");

      const registrationResponsePromise = waitForProductResponse(page, /\/product\/order-drafts\/[^/]+\/trigger$/);
      await page.getByTestId("register-order-button").click();
      const registrationBody = await responseJson(await registrationResponsePromise, "api", "trigger order");
      const registration = requireRecord(registrationBody.trigger, "registration");
      const triggerId = requireString(registration.triggerId, "registration.triggerId");
      Object.assign(closure, {
        draftId: requireString(requireRecord(registrationBody.draft, "draft").draftId, "draft.draftId"),
        triggerId,
        orderId: requireString(registration.orderId, "registration.orderId"),
        triggerTxHash: requireString(registration.txHash, "registration.txHash")
      });
      await expect(page.getByText(/订单已启动|订单启动中，等待确认/)).toBeVisible();

      await waitForStartedTaskProjection(page, apiBaseUrl, requireString(closure.orderId, "orderId"));
      await page.reload();
      await expectWorkbenchSource(page, "real");
      await page.getByRole("button", { name: /^订单$/ }).click();
      await expect(page.getByTestId("order-overview-page")).toBeVisible({ timeout: 20_000 });
      rememberState(closure, await productState(page));
      await assertOrdinaryPageCopy(page);
      await writeRunScreenshot(page, testInfo, "full-order-overview");

      await page.getByTestId("order-current-task-button").click();
      await expect(page.getByTestId("task-detail-page")).toBeVisible();
      await page.getByTestId("upload-demo-evidence-button").click();
      await expect(page.getByText("凭证已上传，指纹已生成")).toBeVisible();
      rememberState(closure, await productState(page));
      await assertOrdinaryPageCopy(page);
      await writeRunScreenshot(page, testInfo, "full-evidence-upload");

      await page.getByTestId("task-confirm-button").click();
      await expect(page.getByTestId("submit-page")).toBeVisible();
      const taskSubmitResponsePromise = waitForProductResponse(page, /\/product\/tasks\/[^/]+\/submit$/);
      await page.getByTestId("submit-confirm-button").click();
      const taskSubmitBody = await responseJson(await taskSubmitResponsePromise, "tx", "submit task");
      const taskSubmission = submissionFromResponse(taskSubmitBody);
      Object.assign(closure, {
        submissionId: requireString(taskSubmission.submissionId, "submission.submissionId")
      });
      const signalTxHash = typeof taskSubmission.txHash === "string" && taskSubmission.txHash.length > 0 ? taskSubmission.txHash : null;
      if (!signalTxHash || taskSubmission.status === "failed") {
        throw new FullFlowStageError("tx", `Product task submit did not produce a confirmed signal tx; status=${String(taskSubmission.status ?? "unknown")} error=${String(taskSubmission.errorCode ?? "none")}`);
      }
      Object.assign(closure, { signalTxHash });
      await expect(page.getByTestId("submit-page").getByText(/提交已确认|提交处理中，等待确认|等待确认/).first()).toBeVisible({ timeout: 20_000 });
      await writeRunScreenshot(page, testInfo, "full-submit-confirmed");

      await page.getByTestId("advanced-proof-button").click();
      await expect(page.getByTestId("advanced-proof-box")).toBeVisible();
      await writeRunScreenshot(page, testInfo, "full-advanced-proof");

      const orderId = requireString(closure.orderId, "orderId");
      Object.assign(closure, {
        projection: await readOrderProjectionSummary(page, apiBaseUrl, orderId),
        proof: await waitForProofSummary(page, apiBaseUrl, orderId, {
          triggerTxHash: requireString(closure.triggerTxHash, "triggerTxHash"),
          signalTxHash: requireString(closure.signalTxHash, "signalTxHash")
        })
      });

      const summary = { ...await productState(page), ...closure };
      await writeFullFlowSummary({ ...summary, success: true }, testInfo);
      expect(summary.draftId, "full summary should include draftId").toBeTruthy();
      expect(summary.triggerId, "full summary should include triggerId").toBeTruthy();
      expect(summary.startId, "full summary should include startId").toBeTruthy();
      expect(summary.orderId, "full summary should include orderId").toBeTruthy();
      expect(summary.evidenceId, "full summary should include evidenceId").toBeTruthy();
      expect(summary.submissionId, "full summary should include submissionId").toBeTruthy();
      expect(summary.triggerTxHash, "full summary should include triggerTxHash").toBeTruthy();
      expect(summary.startTxHash, "full summary should include startTxHash").toBeTruthy();
      expect(summary.signalTxHash, "full summary should include signalTxHash").toBeTruthy();
      expect(summary.projection?.syncStatus, "full summary should include projection sync status").toBeTruthy();
      expect(summary.proof?.hasTriggerProof, "order proof should include trigger tx").toBe(true);
      expect(summary.proof?.hasSignalProof, "order proof should include signal tx").toBe(true);
    } catch (error) {
      const failedStage = error instanceof FullFlowStageError ? error.failedStage : "playwright";
      await writeFullFlowSummary({
        ...await productState(page).catch(() => ({})),
        ...closure,
        success: false,
        failedStage,
        error: error instanceof Error ? error.message : String(error)
      }, testInfo);
      throw error;
    }
  });

  test("negative: missing participant blocks registration", async ({ page }) => {
    skipUnlessFullBackend();
    await openParticipantsWithoutAccepting(page);
    await expect(page.getByTestId("register-order-button")).toBeDisabled();
    await expect(page.getByText("仅当所有启动条件满足后，启动按钮才会可用。")).toBeVisible();
    await expect(page.getByText("当前订单无法启动")).toBeVisible();
  });

  test("negative: missing evidence blocks submission", async ({ page }) => {
    skipUnlessFullBackend();
    await openReadyTask(page);
    await expect(page.getByText("尚未上传凭证")).toBeVisible();
    await expect(page.getByTestId("task-confirm-button")).toBeDisabled();
  });

  test("negative: wallet rejected can be retried", async ({ page, mockWallet }) => {
    skipUnlessFullBackend();
    await openSubmitWithEvidence(page, mockWallet.address);
    await mockWallet.setState({ rejectSignTypedData: true });
    await page.getByTestId("submit-confirm-button").click();
    await expect(page.getByText("你取消了签名，可以重新提交")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("submit-confirm-button")).toBeEnabled();

    await mockWallet.setState({ rejectSignTypedData: false });
    const taskSubmitResponsePromise = waitForProductResponse(page, /\/product\/tasks\/[^/]+\/submit$/);
    await page.getByTestId("submit-confirm-button").click();
    const taskSubmitBody = await responseJson(await taskSubmitResponsePromise, "tx", "submit task after wallet retry");
    const taskSubmission = submissionFromResponse(taskSubmitBody);
    const signalTxHash = requireString(taskSubmission.txHash, "submission.txHash");
    expect(signalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expect(page.getByTestId("submit-page").getByText(/提交已确认|提交处理中，等待确认|等待确认/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("negative: unauthorized wallet is rejected", async ({ page, mockWallet }) => {
    skipUnlessFullBackend();
    await openSubmitWithEvidence(page, mockWallet.address);
    await mockWallet.setState({
      accounts: ["0x0000000000000000000000000000000000000bad"]
    });
    await page.getByTestId("submit-confirm-button").click();
    await expect(page.getByTestId("submit-page").getByText(/确认提交失败|unauthorized_wallet|提交失败/).first()).toBeVisible({ timeout: 20_000 });
    expect((await productState(page)).signalTxHash).toBeFalsy();
  });

  test("negative: indexer syncing state remains visible", async ({ page }) => {
    skipUnlessFullBackend();
    if (isBaseSepoliaRehearsal()) {
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
      return;
    }
    await openReadyTask(page);
    await callProductE2EControl(page, "POST", "/product/e2e/controls/syncing");
    try {
      await page.reload();
      await expectWorkbenchSource(page, "real");
      await page.getByRole("button", { name: /^订单$/ }).click();
      await expect(page.getByTestId("order-overview-page")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("订单状态同步中").first()).toBeVisible();
      expect((await productState(page)).syncState).toBe("syncing");
    } finally {
      await callProductE2EControl(page, "DELETE", "/product/e2e/controls/syncing");
    }
    await page.reload();
    await expectWorkbenchSource(page, "real");
    await page.getByRole("button", { name: /^订单$/ }).click();
    await expect(page.getByTestId("order-overview-page")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("订单状态同步中").first()).toHaveCount(0);
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

async function acceptRequiredParticipants(
  page: Page,
  walletAddresses: string | readonly string[]
): Promise<AcceptParticipantsResult> {
  const result = await page.evaluate(async (addresses) => {
    const bridge = window.__uvpProductWorkbenchE2E;
    if (!bridge) {
      throw new Error("product_workbench_e2e_bridge_missing");
    }
    return await bridge.acceptRequiredParticipants(addresses);
  }, walletAddresses);
  return result;
}

async function openParticipantsWithoutAccepting(page: Page): Promise<void> {
  await page.goto("/app");
  await expectWorkbenchSource(page, "real");
  await page.getByTestId("catalog-detail-button").click();
  await expect(page.getByRole("heading", { name: /跨境高价值货物/ })).toBeVisible();
  await page.getByTestId("zhixu-create-order-button").click();
  await expect(page.getByRole("heading", { name: "创建跨境订单" })).toBeVisible();
  await page.getByTestId("create-draft-button").click();
  await expect(page.getByTestId("product-workbench")).not.toHaveAttribute("data-uvp-draft-id", "");
  await page.getByTestId("save-draft-button").click();
  await expect(page.getByText("草稿已保存")).toBeVisible();
  await page.getByTestId("next-participants-button").click();
  await expect(page.getByRole("heading", { name: "邀请参与方确认职责" })).toBeVisible();
}

async function openReadyTask(page: Page, walletAddress = "0x0000000000000000000000000000000000000001"): Promise<Partial<ProductWorkbenchE2EState>> {
  const closure: Partial<ProductWorkbenchE2EState> = {};
  await openParticipantsWithoutAccepting(page);
  const participantResult = await acceptRequiredParticipants(page, requiredParticipantWallets(walletAddress));
  expect(participantResult.missingRequired).toBe(0);
  await expect(page.getByTestId("register-order-button")).toBeEnabled();

  const registrationResponsePromise = waitForProductResponse(page, /\/product\/order-drafts\/[^/]+\/trigger$/);
  await page.getByTestId("register-order-button").click();
  const registrationBody = await responseJson(await registrationResponsePromise, "api", "trigger order");
  const registration = requireRecord(registrationBody.trigger, "registration");
  const triggerId = requireString(registration.triggerId, "registration.triggerId");
  Object.assign(closure, {
    draftId: requireString(requireRecord(registrationBody.draft, "draft").draftId, "draft.draftId"),
    triggerId,
    orderId: requireString(registration.orderId, "registration.orderId"),
    triggerTxHash: requireString(registration.txHash, "registration.txHash")
  });

  const apiBaseUrl = requireString((await productState(page)).apiBaseUrl, "apiBaseUrl");
  await waitForStartedTaskProjection(page, apiBaseUrl, requireString(closure.orderId, "orderId"));
  await page.reload();
  await expectWorkbenchSource(page, "real");
  await page.getByRole("button", { name: /^订单$/ }).click();
  await expect(page.getByTestId("order-overview-page")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("order-current-task-button").click();
  await expect(page.getByTestId("task-detail-page")).toBeVisible({ timeout: 20_000 });
  rememberState(closure, await productState(page));
  return closure;
}

function requiredParticipantWallets(deliveryWalletAddress: string): readonly string[] {
  const externalWallets = (process.env.UVP_REHEARSAL_PARTICIPANT_WALLETS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.toLowerCase() !== deliveryWalletAddress.toLowerCase());
  const fallbackWallets = [
    "0x0000000000000000000000000000000000000101",
    "0x0000000000000000000000000000000000000102",
    "0x0000000000000000000000000000000000000103",
    "0x0000000000000000000000000000000000000104"
  ];
  const [funds, supply, validation, maintainer] = [...externalWallets, ...fallbackWallets];
  return [funds, supply, deliveryWalletAddress, validation, maintainer];
}

async function openSubmitWithEvidence(page: Page, walletAddress: string): Promise<Partial<ProductWorkbenchE2EState>> {
  const closure = await openReadyTask(page, walletAddress);
  await page.getByTestId("upload-demo-evidence-button").click();
  await expect(page.getByText("凭证已上传，指纹已生成")).toBeVisible();
  await page.getByTestId("task-confirm-button").click();
  await expect(page.getByTestId("submit-page")).toBeVisible();
  rememberState(closure, await productState(page));
  return closure;
}

async function callProductE2EControl(page: Page, method: "POST" | "DELETE", pathname: string): Promise<Record<string, unknown>> {
  const apiBaseUrl = requireString((await productState(page)).apiBaseUrl, "apiBaseUrl");
  const result = await page.evaluate(async ({ baseUrl, path, requestMethod }) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: requestMethod,
      headers: { "content-type": "application/json" },
      body: requestMethod === "POST" ? "{}" : undefined
    });
    return {
      status: response.status,
      text: await response.text()
    };
  }, { baseUrl: apiBaseUrl, path: pathname, requestMethod: method });
  const body = parseJsonObject(result.text, `${method} ${pathname}`);
  if (result.status === 404) {
    throw new FullFlowStageError("api", `${method} ${pathname} returned 404; enable UVP_PRODUCT_E2E_FIXTURES=1 for full Product E2E controls`);
  }
  if (result.status < 200 || result.status >= 300) {
    throw new FullFlowStageError("api", `${method} ${pathname} returned ${result.status}: ${result.text.slice(0, 500)}`);
  }
  return body;
}

async function productState(page: Page): Promise<ProductWorkbenchE2EState> {
  return await page.evaluate(() => {
    const bridge = window.__uvpProductWorkbenchE2E;
    if (bridge) {
      return bridge.state;
    }
    const workbench = document.querySelector("[data-testid='product-workbench']");
    return {
      mode: workbench?.getAttribute("data-uvp-mode") ?? undefined,
      view: workbench?.getAttribute("data-uvp-view") ?? undefined,
      sourceKind: workbench?.getAttribute("data-uvp-source") as ProductWorkbenchE2EState["sourceKind"],
      apiBaseUrl: workbench?.getAttribute("data-uvp-api-base-url") ?? null,
      draftId: workbench?.getAttribute("data-uvp-draft-id") ?? null,
      orderId: workbench?.getAttribute("data-uvp-order-id") ?? null,
      taskId: workbench?.getAttribute("data-uvp-task-id") ?? null,
      evidenceId: workbench?.getAttribute("data-uvp-evidence-id") ?? null,
      submissionId: workbench?.getAttribute("data-uvp-submission-id") ?? null,
      triggerTxHash: workbench?.getAttribute("data-uvp-trigger-tx-hash") ?? null,
      signalTxHash: workbench?.getAttribute("data-uvp-signal-tx-hash") ?? null
    };
  });
}

function rememberState(target: Partial<ProductWorkbenchE2EState>, state: ProductWorkbenchE2EState): void {
  for (const [key, value] of Object.entries(state) as Array<[keyof ProductWorkbenchE2EState, string | null | undefined]>) {
    if (value !== undefined && value !== null && value !== "") {
      (target as Record<string, string>)[key] = value;
    }
  }
}

async function writeFullFlowSummary(summary: ProductWorkbenchE2EState & {
  readonly success?: boolean;
  readonly failedStage?: string;
  readonly error?: string;
}, testInfo: TestInfo): Promise<void> {
  const runRoot = process.env.UVP_STORE_E2E_RUN_ROOT;
  const body = Buffer.from(JSON.stringify({
    schemaVersion: "uvp-eth.store-product-workbench.full-flow.v1",
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

async function waitForProductResponse(page: Page, pathPattern: RegExp) {
  return await page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && pathPattern.test(url.pathname);
  }, { timeout: 20_000 });
}

async function responseJson(response: Awaited<ReturnType<typeof waitForProductResponse>>, stage: FullFailedStage, label: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  const body = parseJsonObject(text, label);
  if (!response.ok()) {
    throw new FullFlowStageError(stage, `${label} returned ${response.status()}: ${text.slice(0, 500)}`);
  }
  return body;
}

async function waitForStartedTaskProjection(page: Page, apiBaseUrl: string, orderId: string): Promise<void> {
  const projectionTimeoutMs = Number(process.env.UVP_PRODUCT_E2E_PROJECTION_TIMEOUT_MS ?? "240000");
  const deadline = Date.now() + projectionTimeoutMs;
  let lastBody = "";
  while (Date.now() <= deadline) {
    const result = await page.evaluate(async ({ baseUrl, id }) => {
      const response = await fetch(`${baseUrl}/product/tasks?orderId=${encodeURIComponent(id)}&status=ready`);
      return { status: response.status, text: await response.text() };
    }, { baseUrl: apiBaseUrl, id: orderId });
    lastBody = result.text;
    if (result.status >= 500) {
      throw new FullFlowStageError("indexer", `Product tasks projection returned ${result.status}: ${result.text.slice(0, 500)}`);
    }
    if (result.status === 200) {
      const body = parseJsonObject(result.text, "tasks projection");
      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      if (tasks.some((task) => requireRecord(task, "task").status === "open")) {
        return;
      }
    }
    await page.waitForTimeout(1000);
  }
  throw new FullFlowStageError("indexer", `started order task projection did not become visible for ${orderId}; last body ${lastBody.slice(0, 500)}`);
}

async function readOrderProjectionSummary(page: Page, apiBaseUrl: string, orderId: string): Promise<ProductProjectionSummary> {
  const result = await page.evaluate(async ({ baseUrl, id }) => {
    const response = await fetch(`${baseUrl}/product/orders/${encodeURIComponent(id)}`);
    return { status: response.status, text: await response.text() };
  }, { baseUrl: apiBaseUrl, id: orderId });
  if (result.status < 200 || result.status >= 300) {
    throw new FullFlowStageError("indexer", `Product order projection returned ${result.status}: ${result.text.slice(0, 500)}`);
  }
  const body = parseJsonObject(result.text, "order projection");
  const order = requireRecord(body.order, "order");
  const projection = requireRecord(order.projection, "order.projection");
  return {
    syncStatus: optionalString(projection.syncStatus),
    latestIndexedBlock: optionalString(projection.latestIndexedBlock),
    finalizedBlock: optionalString(projection.finalizedBlock),
    confirmationDepth: optionalNumber(projection.confirmationDepth),
    eventCount: optionalNumber(projection.eventCount),
    rebuildStatus: optionalString(projection.rebuildStatus)
  };
}

async function readProofSummary(
  page: Page,
  apiBaseUrl: string,
  orderId: string,
  hashes: { readonly triggerTxHash: string; readonly signalTxHash: string }
): Promise<ProductProofSummary> {
  const [timelineResult, proofResult] = await Promise.all([
    page.evaluate(async ({ baseUrl, id }) => {
      const response = await fetch(`${baseUrl}/product/orders/${encodeURIComponent(id)}/timeline`);
      return { status: response.status, text: await response.text() };
    }, { baseUrl: apiBaseUrl, id: orderId }),
    page.evaluate(async ({ baseUrl, id }) => {
      const response = await fetch(`${baseUrl}/product/orders/${encodeURIComponent(id)}/proof`);
      return { status: response.status, text: await response.text() };
    }, { baseUrl: apiBaseUrl, id: orderId })
  ]);
  if (timelineResult.status < 200 || timelineResult.status >= 300) {
    throw new FullFlowStageError("indexer", `Product timeline returned ${timelineResult.status}: ${timelineResult.text.slice(0, 500)}`);
  }
  if (proofResult.status < 200 || proofResult.status >= 300) {
    throw new FullFlowStageError("indexer", `Product proof returned ${proofResult.status}: ${proofResult.text.slice(0, 500)}`);
  }
  const timelineBody = parseJsonObject(timelineResult.text, "order timeline");
  const proofBody = parseJsonObject(proofResult.text, "order proof");
  const timeline = Array.isArray(timelineBody.timeline) ? timelineBody.timeline : [];
  const proof = Array.isArray(proofBody.proof) ? proofBody.proof : [];
  const transactionHashes = uniqueStrings([...timeline, ...proof], "transactionHash");
  const blockNumbers = uniqueStrings([...timeline, ...proof], "blockNumber");
  return {
    timelineEventCount: timeline.length,
    proofEventCount: proof.length,
    transactionHashes,
    blockNumbers,
    hasTriggerProof: transactionHashes.some((hash) => hash.toLowerCase() === hashes.triggerTxHash.toLowerCase()),
    hasSignalProof: transactionHashes.some((hash) => hash.toLowerCase() === hashes.signalTxHash.toLowerCase())
  };
}

async function waitForProofSummary(
  page: Page,
  apiBaseUrl: string,
  orderId: string,
  hashes: { readonly triggerTxHash: string; readonly signalTxHash: string }
): Promise<ProductProofSummary> {
  const projectionTimeoutMs = Number(process.env.UVP_PRODUCT_E2E_PROJECTION_TIMEOUT_MS ?? "240000");
  const deadline = Date.now() + projectionTimeoutMs;
  let lastSummary: ProductProofSummary | undefined;
  while (Date.now() <= deadline) {
    lastSummary = await readProofSummary(page, apiBaseUrl, orderId, hashes);
    if (lastSummary.hasTriggerProof && lastSummary.hasSignalProof) {
      return lastSummary;
    }
    await page.waitForTimeout(1000);
  }
  throw new FullFlowStageError(
    "indexer",
    `order proof did not include required txs for ${orderId}; hasTriggerProof=${String(lastSummary?.hasTriggerProof ?? false)} hasSignalProof=${String(lastSummary?.hasSignalProof ?? false)} txs=${JSON.stringify(lastSummary?.transactionHashes ?? [])}`
  );
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return requireRecord(parsed, label);
  } catch (error) {
    throw new FullFlowStageError("api", `${label} did not return a JSON object: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FullFlowStageError("api", `${label} is missing or invalid`);
  }
  return value as Record<string, unknown>;
}

function submissionFromResponse(value: Record<string, unknown>): Record<string, unknown> {
  return requireRecord(value.submission ?? value, "submission");
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new FullFlowStageError("api", `${label} is missing`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function uniqueStrings(items: readonly unknown[], field: string): readonly string[] {
  return [...new Set(items
    .map((item) => requireRecord(item, field)[field])
    .filter((value): value is string => typeof value === "string" && value.length > 0))];
}
