import { expect, test, type Page } from "@playwright/test";
import { STUB_API_BASE } from "./workbench-stubs";

/**
 * PRD89-92 Store 侧 e2e（fixture 模式，全桩）：
 * - 钱包登录（mock window.ethereum）→ 会话锚定 → 账号页地址表。
 * - 详情页锚核验面板 + 加入入口；锚冲突时显式告警并抑制加入入口（红线）。
 * - 运营方上架治理面板可见。
 */

const WALLET_ADDRESS = "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a";
const PLAN_ID = "0x0000000000000000000000000000000000000000000000000000000000000101";

const zhixuRow = {
  zhixuId: "cross-border-high-value-staged-payment",
  title: "跨境高价值 staged payment",
  subtitle: "演示秩序",
  reviewStatus: "approved",
  reviewLabel: "Store 审核通过",
  riskLevel: "中",
  applicableBusiness: [],
  excludedBusiness: [],
  stageCount: 2,
  roleSlotCount: 2,
  supportedPaymentMethods: [],
  maintainer: "演示维护方",
  updatedAt: "2026-09-01T00:00:00.000Z",
  planPublication: { status: "published", label: "计划已发布并锚定", stateMachineLabel: "状态机已部署", planId: PLAN_ID, planHash: "0xhash-a" }
};

const zhixuDetail = {
  ...zhixuRow,
  description: "演示秩序描述",
  lifecycleReason: "演示",
  usageGuidance: "演示",
  stages: [{ stageId: "stage-export", index: 0, name: "出口", evidence: [], ownerRole: "supplier", status: "pending" }],
  roleSlots: [{
    roleSlotId: "funds",
    title: "资金槽位",
    description: "负责资金腿履约",
    required: true,
    expectedEvidence: [],
    statusLabel: "开放",
    capabilityReviewStatus: "explicit",
    capabilityReviewLabel: "已显式确认",
    performanceSlotLabel: "资金执行者",
    businessPersonaLabels: [],
    capabilityPlugins: []
  }],
  supplierRequirements: [],
  riskTags: [],
  versionHistory: [],
  proofSections: [],
  allowedActions: [],
  planId: PLAN_ID,
  planHash: "0xhash-a",
  lifecycleStatus: "active",
  lifecycleLabel: "可创建订单",
  versionLabel: "v1",
  orderCount: 0,
  openTaskCount: 0,
  supplierCount: 0,
  metricsStatus: "reported",
  nextAction: "查看秩序资料",
  updatedAt: "2026-09-01T00:00:00.000Z",
  proofRows: []
};

type OverlayMode = "consistent" | "conflict" | "delisted" | "absent";

function storeOverlay(mode: OverlayMode): Record<string, unknown> {
  const verification = {
    listingId: "listing-1",
    planId: PLAN_ID,
    status: mode === "conflict" ? "conflict" : "consistent",
    checks: [
      { id: "plan_projected", label: "秩序已在链上注册并被索引", outcome: "match" },
      { id: "plan_hash", label: "listing 声称的 planHash 与链上一致", expected: "0xhash-a", actual: mode === "conflict" ? "0xhash-b" : "0xhash-a", outcome: mode === "conflict" ? "mismatch" : "match" },
      { id: "chain_read", label: "链上直读", outcome: "unavailable" }
    ],
    projection: { planProjected: true, planHash: "0xhash-a", publisher: "0xaaaa000000000000000000000000000000000001" },
    verifiedAt: "2026-09-01T00:00:00.000Z"
  };
  return {
    listing: {
      listingId: "listing-1",
      planId: PLAN_ID,
      planHashClaimed: "0xhash-a",
      status: mode === "delisted" ? "delisted" : "public",
      importedAt: "2026-09-01T00:00:00.000Z"
    },
    anchorVerification: verification,
    decoration: {
      planId: PLAN_ID,
      current: {
        decorationId: "decor-1",
        planId: PLAN_ID,
        version: 1,
        data: {
          schemaVersion: "store-zhixu-decoration.v1",
          theme: { displayName: "装修后的展示名", description: "装修描述", tags: ["demo"] }
        },
        authorAddress: "0xaaaa000000000000000000000000000000000001",
        createdAt: "2026-09-01T00:00:00.000Z"
      },
      versions: []
    },
    viewerPermission: {
      planId: PLAN_ID,
      publisher: "0xaaaa000000000000000000000000000000000001",
      viewerIsPublisher: false,
      viewerActiveDelegations: []
    }
  };
}

async function installStoreRoutes(page: Page, options: { readonly overlayMode: OverlayMode; readonly anchored: boolean }): Promise<void> {
  let loggedIn = options.anchored;
  await page.route(`${STUB_API_BASE}/store/**`, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();
    const fulfill = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (pathname === "/store/zhixus" && method === "GET") {
      await fulfill({
        summary: { totalZhixus: 1, needsReview: 0, activeZhixus: 1, runningOrders: 0, registeredSuppliers: 0 },
        zhixus: [zhixuRow]
      });
      return;
    }
    if (pathname.startsWith("/store/zhixus/") && method === "GET") {
      // absent：从未进入上架流程的秩序，服务端不返回叠加层。
      await fulfill(options.overlayMode === "absent"
        ? { zhixu: zhixuDetail }
        : { zhixu: zhixuDetail, storeOverlay: storeOverlay(options.overlayMode) });
      return;
    }
    if (pathname === "/store/session" && method === "GET") {
      await fulfill({
        session: {
          authenticated: loggedIn,
          accessLevel: loggedIn ? "store_read" : "anonymous_read",
          roles: loggedIn ? ["store_read"] : ["anonymous_read"],
          capabilities: ["store.read"],
          authMode: loggedIn ? "wallet_session" : "anonymous",
          ...(loggedIn
            ? {
              anchoredAddress: WALLET_ADDRESS,
              anchorSource: "wallet_session",
              accountId: "acct-1",
              accountAddresses: [{ address: WALLET_ADDRESS, status: "active", anchoredAt: "2026-09-01T00:00:00.000Z" }]
            }
            : {})
        }
      });
      return;
    }
    if (pathname === "/store/auth/challenge" && method === "POST") {
      await fulfill({
        challenge: {
          nonce: "stub-nonce",
          address: WALLET_ADDRESS,
          message: `uvp-store wants you to sign in with your EVM account:\n${WALLET_ADDRESS}\n`,
          issuedAt: "2026-09-01T00:00:00.000Z",
          expiresAt: "2026-09-01T00:05:00.000Z"
        }
      }, 201);
      return;
    }
    if (pathname === "/store/auth/verify" && method === "POST") {
      loggedIn = true;
      await fulfill({
        token: "uvs_stub_token",
        session: {
          sessionId: "sess-1",
          accountId: "acct-1",
          anchoredAddress: WALLET_ADDRESS,
          createdAt: "2026-09-01T00:00:00.000Z",
          expiresAt: "2026-09-02T00:00:00.000Z",
          addresses: [{ address: WALLET_ADDRESS, status: "active", anchoredAt: "2026-09-01T00:00:00.000Z" }]
        },
        linkedToExistingAccount: false
      }, 201);
      return;
    }
    if (pathname === "/store/auth/addresses" && method === "GET") {
      await fulfill({ accountId: "acct-1", addresses: [{ address: WALLET_ADDRESS, status: "active", anchoredAt: "2026-09-01T00:00:00.000Z" }] });
      return;
    }
    if (pathname === "/store/auth/logout" && method === "POST") {
      loggedIn = false;
      await fulfill({ revoked: true });
      return;
    }
    if (pathname === "/store/join-applications" && method === "GET") {
      await fulfill({ applications: [], scope: "viewer" });
      return;
    }
    if (pathname === "/store/listings" && method === "GET") {
      await fulfill({ listings: [] });
      return;
    }
    await fulfill({ error: "not_found" }, 404);
  });
}

async function installMockWallet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const address = "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a";
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async (args: { method: string }) => {
        if (args.method === "eth_requestAccounts") {
          return [address];
        }
        if (args.method === "personal_sign") {
          return "0xstub-signature";
        }
        throw new Error(`mock wallet: unsupported method ${args.method}`);
      }
    };
  });
}

test("PRD89: wallet login anchors the session and the account page lists addresses", async ({ page }) => {
  await installStoreRoutes(page, { overlayMode: "consistent", anchored: false });
  await installMockWallet(page);
  await page.goto("/store");

  await expect(page.getByTestId("store-app")).toBeVisible();
  await expect(page.getByTestId("store-anchored-chip")).toHaveCount(0);

  await page.getByTestId("store-head-login").click();
  await expect(page.getByTestId("store-anchored-chip")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("store-login-message")).toContainText("已登录");

  await page.getByRole("tab", { name: /账号与地址/ }).click();
  await expect(page.getByTestId("store-account-page")).toBeVisible();
  await expect(page.getByTestId("store-address-table")).toBeVisible();
  await expect(page.getByTestId("store-address-row")).toHaveCount(1);
});

test("PRD92: detail page shows anchor verification and suppresses join entry on conflict", async ({ page }) => {
  await installStoreRoutes(page, { overlayMode: "conflict", anchored: true });
  await installMockWallet(page);
  await page.goto("/store");

  await page.getByRole("tab", { name: /秩序检索/ }).click();
  await page.getByTestId("store-open-zhixu-button").first().click();

  await expect(page.getByTestId("store-zhixu-detail-page")).toBeVisible();
  await expect(page.getByTestId("store-anchor-panel")).toBeVisible();
  await expect(page.getByTestId("store-anchor-panel")).toHaveAttribute("data-anchor-status", "conflict");
  await expect(page.getByTestId("store-suppression-banner")).toBeVisible();
  // 红线：锚冲突时加入入口被抑制。
  await expect(page.getByTestId("store-join-entry")).toHaveCount(0);
});

test("PRD92/90: consistent overlay keeps the join entry and shows decoration theme", async ({ page }) => {
  await installStoreRoutes(page, { overlayMode: "consistent", anchored: true });
  await installMockWallet(page);
  await page.goto("/store");

  await page.getByRole("tab", { name: /秩序检索/ }).click();
  await page.getByTestId("store-open-zhixu-button").first().click();

  await expect(page.getByTestId("store-zhixu-detail-page")).toBeVisible();
  await expect(page.getByTestId("store-anchor-panel")).toHaveAttribute("data-anchor-status", "consistent");
  await expect(page.getByTestId("store-join-entry")).toBeVisible();
  // 装修主题覆盖展示名（PRD91 theme）。
  await expect(page.getByRole("heading", { name: "装修后的展示名" })).toBeVisible();
  // 装修面板出现且非 publisher 只读。
  await expect(page.getByTestId("store-decoration-panel")).toBeVisible();
});

test("PRD90: unanchored session is told to log in before joining", async ({ page }) => {
  await installStoreRoutes(page, { overlayMode: "consistent", anchored: false });
  await page.goto("/store");

  await page.getByRole("tab", { name: /秩序检索/ }).click();
  await page.getByTestId("store-open-zhixu-button").first().click();

  await expect(page.getByTestId("store-join-entry")).toBeVisible();
  await expect(page.getByTestId("store-join-entry")).toContainText("先在「账号与地址」页连接钱包登录");
});

test("PRD92: delisted listing suppresses the join entry and shows the banner", async ({ page }) => {
  await installStoreRoutes(page, { overlayMode: "delisted", anchored: true });
  await page.goto("/store");

  await page.getByTestId("store-open-zhixu-button").first().click();
  await expect(page.getByTestId("store-zhixu-detail-page")).toBeVisible();
  await expect(page.getByTestId("store-suppression-banner")).toBeVisible();
  await expect(page.getByTestId("store-join-entry")).toHaveCount(0);
  await expect(page.getByTestId("store-anchor-panel")).toContainText("已下架");
});

test("O25: zhixu that never entered the listing flow keeps the join entry closed", async ({ page }) => {
  // fail-closed：无上架/锚核验叠加层（状态未知）时不得放开加入入口。
  await installStoreRoutes(page, { overlayMode: "absent", anchored: true });
  await installMockWallet(page);
  await page.goto("/store");

  await page.getByTestId("store-open-zhixu-button").first().click();
  await expect(page.getByTestId("store-zhixu-detail-page")).toBeVisible();
  await expect(page.getByTestId("store-suppression-banner")).toBeVisible();
  await expect(page.getByTestId("store-suppression-banner")).toContainText("未完成上架");
  await expect(page.getByTestId("store-join-entry")).toHaveCount(0);
});

test("PRD89: account page login persists the session token and logout clears it", async ({ page }) => {
  await installStoreRoutes(page, { overlayMode: "consistent", anchored: false });
  await installMockWallet(page);
  await page.goto("/store");

  await page.getByRole("tab", { name: /账号与地址/ }).click();
  await expect(page.getByTestId("store-account-page")).toBeVisible();
  await expect(page.getByTestId("store-address-table")).toHaveCount(0);

  await page.getByTestId("store-login-button").click();
  // 账号页登录持久化 token → 会话锚定 → 地址表出现。
  await expect(page.getByTestId("store-address-table")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("store-anchored-chip")).toBeVisible();
  await expect(page.getByTestId("store-address-row")).toHaveCount(1);

  // 账号页登出清除 token → 地址表消失、锚定徽标消失。
  await page.getByTestId("store-logout-button").click();
  await expect(page.getByTestId("store-address-table")).toHaveCount(0);
  await expect(page.getByTestId("store-anchored-chip")).toHaveCount(0);
});
