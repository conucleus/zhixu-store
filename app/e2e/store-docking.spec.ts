import { expect, test } from "@playwright/test";
import { installWorkbenchRoutes, STUB_API_BASE } from "./workbench-stubs";

// 写路径用例要求独立 profile 的 dev server（VITE_UVP_STORE_ACCESS_LEVEL=store_operator）；
// 常规 fixture 跑（anonymous_read，403 是写失败边界）时整组跳过。
test.skip(
  process.env.UVP_PRODUCT_BROWSER_E2E_STORE_ACCESS_LEVEL !== "store_operator",
  "store docking write e2e requires UVP_PRODUCT_BROWSER_E2E_STORE_ACCESS_LEVEL=store_operator (pnpm run test:e2e:docking)"
);

const storeZhixuA = {
  zhixuId: "store-zhixu-a",
  title: "Store 秩序甲",
  subtitle: "跨境履约秩序甲",
  maintainer: "Store 维护方",
  versionLabel: "Plan 版本",
  lifecycleStatus: "active",
  lifecycleLabel: "可创建订单",
  reviewStatus: "approved",
  reviewLabel: "Store 审核通过",
  riskLevel: "中",
  stageCount: 3,
  roleSlotCount: 4,
  orderCount: 1,
  openTaskCount: 2,
  supplierCount: 1,
  metricsStatus: "reported",
  planId: "0xplan-a",
  planHash: "0xhash-a",
  planPublication: { status: "published", label: "计划已发布并锚定", stateMachineLabel: "状态机已部署", planId: "0xplan-a", planHash: "0xhash-a" },
  nextAction: "查看秩序资料",
  updatedAt: "2026-01-01T00:00:00.000Z",
  proofRows: []
};

const storeZhixuB = {
  ...storeZhixuA,
  zhixuId: "store-zhixu-b",
  title: "Store 秩序乙",
  subtitle: "跨境履约秩序乙",
  planId: "0xplan-b",
  planHash: "0xhash-b",
  planPublication: { ...storeZhixuA.planPublication, planId: "0xplan-b", planHash: "0xhash-b" }
};

const storeSummary = {
  totalZhixus: 2,
  activeZhixus: 2,
  needsReview: 0,
  runningOrders: 0,
  openTasks: 0,
  registeredSuppliers: 0
};

test.describe("Store docking sandbox target selection", () => {
  test("requires an explicit target, refuses source==target, and creates real sessions for distinct pairs", async ({ page }) => {
    await installWorkbenchRoutes(page);
    const dockingRequests: Array<{ readonly sourceZhixuId?: string; readonly targetZhixuId?: string }> = [];
    await page.route(`${STUB_API_BASE}/store/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/store/session") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: {
              authenticated: true,
              principalId: "store-operator",
              accessLevel: "store_operator",
              roles: ["store_operator"],
              capabilities: ["store.read", "store.docking.create", "store.docking.validate", "store.docking.save"],
              authMode: "dev_store_headers"
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
            summary: storeSummary,
            zhixus: [storeZhixuA, storeZhixuB]
          })
        });
        return;
      }
      if (pathname === "/store/docking-sessions" && route.request().method() === "POST") {
        const body = route.request().postDataJSON() as { readonly sourceZhixuId?: string; readonly targetZhixuId?: string };
        dockingRequests.push(body);
        const source = body.sourceZhixuId === "store-zhixu-b" ? storeZhixuB : storeZhixuA;
        const target = body.targetZhixuId === "store-zhixu-b" ? storeZhixuB : storeZhixuA;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: {
              sessionId: "dock_test-0001",
              status: "draft",
              source: {
                zhixuId: source.zhixuId,
                title: source.title,
                versionLabel: source.versionLabel,
                lifecycleStatus: source.lifecycleStatus,
                publicationStatus: source.planPublication.status,
                planId: source.planId,
                planHash: source.planHash
              },
              target: {
                zhixuId: target.zhixuId,
                title: target.title,
                versionLabel: target.versionLabel,
                lifecycleStatus: target.lifecycleStatus,
                publicationStatus: target.planPublication.status,
                planId: target.planId,
                planHash: target.planHash
              },
              candidateMappings: [],
              draftSignalMap: [],
              validation: { ok: false, errors: [], nonPublishing: true },
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          })
        });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
    });

    await page.goto("/store");
    await expect(page.getByTestId("store-app")).toBeVisible();
    await page.getByRole("tab", { name: /试拼沙箱/ }).click();
    await expect(page.getByTestId("store-docking-page")).toBeVisible();

    // 未选择目标时不能创建：不再静默取“第一个非来源秩序”
    await expect(page.getByTestId("store-create-docking-session-button")).toBeDisabled();
    await expect(page.getByText("尚未选择")).toBeVisible();

    // 选择与来源相同的秩序：显式拒绝，不发请求
    await page.getByTestId("store-docking-target-select").selectOption("store-zhixu-a");
    await expect(page.getByTestId("store-docking-same-target-warning")).toBeVisible();
    await expect(page.getByTestId("store-create-docking-session-button")).toBeDisabled();

    // 选择不同的目标秩序：正常创建会话
    await page.getByTestId("store-docking-target-select").selectOption("store-zhixu-b");
    await expect(page.getByTestId("store-docking-same-target-warning")).toHaveCount(0);
    await page.getByTestId("store-create-docking-session-button").click();
    await expect(page.getByText("dock_test-0001")).toBeVisible();
    expect(dockingRequests).toEqual([{ sourceZhixuId: "store-zhixu-a", targetZhixuId: "store-zhixu-b" }]);
  });

  test("single-zhixu catalog cannot create a self-docking session", async ({ page }) => {
    await installWorkbenchRoutes(page);
    await page.route(`${STUB_API_BASE}/store/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/store/session") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: {
              authenticated: true,
              principalId: "store-operator",
              accessLevel: "store_operator",
              roles: ["store_operator"],
              capabilities: ["store.read", "store.docking.create"],
              authMode: "dev_store_headers"
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
            summary: { ...storeSummary, totalZhixus: 1, activeZhixus: 1 },
            zhixus: [storeZhixuA]
          })
        });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
    });

    await page.goto("/store");
    await expect(page.getByTestId("store-app")).toBeVisible();
    await page.getByRole("tab", { name: /试拼沙箱/ }).click();
    await expect(page.getByTestId("store-docking-page")).toBeVisible();

    const options = page.getByTestId("store-docking-target-select").locator("option");
    await expect(options).toHaveCount(2); // 占位项 + 唯一秩序
    await page.getByTestId("store-docking-target-select").selectOption("store-zhixu-a");
    await expect(page.getByTestId("store-docking-same-target-warning")).toBeVisible();
    await expect(page.getByTestId("store-create-docking-session-button")).toBeDisabled();
  });
});
