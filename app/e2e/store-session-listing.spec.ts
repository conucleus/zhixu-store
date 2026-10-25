import { expect, test, type Page } from "@playwright/test";
import { STUB_API_BASE } from "./stub-api";

const WALLET_ADDRESS = "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a";
const PLAN_ID = "0x0000000000000000000000000000000000000000000000000000000000000101";
const ZHIXU_ID = "zx-3fa636e0229362fa4f6db3db37737a17";

const zhixuRow = {
  zhixuId: ZHIXU_ID,
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
  lifecycleStatus: "active",
  lifecycleLabel: "可创建订单",
  versionLabel: "v1",
  orderCount: 0,
  openTaskCount: 0,
  supplierCount: 0,
  metricsStatus: "reported",
  nextAction: "查看秩序资料",
  stages: [
    { stageId: "stage-export", index: 0, title: "出口", description: "出口流程节点与放行", ownerRole: "supplier", evidence: [], status: "pending" },
    { stageId: "stage-fulfillment", index: 1, title: "交付", description: "跨境履约", ownerRole: "supplier", evidence: [], status: "pending" }
  ],
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
  proofRows: []
};

const decorationOverlay = {
  listing: { status: "public" },
  anchorVerification: { status: "consistent" },
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
  }
};

async function installStoreRoutes(
  page: Page,
  options: { readonly anchored: boolean; readonly zhixus?: readonly unknown[] }
): Promise<void> {
  let loggedIn = options.anchored;
  const catalogRows = options.zhixus ?? [zhixuRow];
  await page.route(`${STUB_API_BASE}/store/**`, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();
    const fulfill = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (pathname === "/store/zhixus" && method === "GET") {
      await fulfill({
        sourceOfTruth: "contracts-and-chain-events",
        summary: { totalZhixus: catalogRows.length, needsReview: 0, activeZhixus: catalogRows.length, runningOrders: 0, openTasks: 0, registeredSuppliers: 0 },
        zhixus: catalogRows
      });
      return;
    }
    if (pathname.startsWith("/store/zhixus/") && method === "GET") {
      await fulfill({ zhixu: zhixuDetail, storeOverlay: decorationOverlay });
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
    if (pathname === "/store/suppliers" && method === "GET") {
      await fulfill({ suppliers: [] });
      return;
    }
    await fulfill({ error: "not_found" }, 404);
  });
}

async function installMockWallet(page: Page): Promise<void> {
  await page.addInitScript(({ address }) => {
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
  }, { address: WALLET_ADDRESS });
}

test("wallet login anchors the session and the account page lists addresses", async ({ page }) => {
  await installStoreRoutes(page, { anchored: false });
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

test("account page login persists the session token and logout clears it", async ({ page }) => {
  await installStoreRoutes(page, { anchored: false });
  await installMockWallet(page);
  await page.goto("/store");

  await page.getByRole("tab", { name: /账号与地址/ }).click();
  await expect(page.getByTestId("store-account-page")).toBeVisible();
  await expect(page.getByTestId("store-address-table")).toHaveCount(0);

  await page.getByTestId("store-login-button").click();
  await expect(page.getByTestId("store-address-table")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("store-anchored-chip")).toBeVisible();
  await expect(page.getByTestId("store-address-row")).toHaveCount(1);

  await page.getByTestId("store-logout-button").click();
  await expect(page.getByTestId("store-address-table")).toHaveCount(0);
  await expect(page.getByTestId("store-anchored-chip")).toHaveCount(0);
});

test("link block generates invite and share links for Store-visible zhixus, with no directory or public-listing entry", async ({ page }) => {
  await installStoreRoutes(page, { anchored: true });
  await page.goto("/store");

  await page.getByRole("tab", { name: "链接" }).click();
  await expect(page.getByTestId("store-link-page")).toBeVisible();

  const inviteInput = page.getByTestId("store-link-input-invite");
  const shareInput = page.getByTestId("store-link-input-share");
  await expect(inviteInput).toHaveValue(new RegExp(`/store\\?join=${ZHIXU_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(shareInput).toHaveValue(new RegExp(`/store\\?share=${ZHIXU_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(page.getByTestId("store-link-copy-invite")).toBeVisible();
  await expect(page.getByTestId("store-link-copy-share")).toBeVisible();

  await expect(page.getByRole("button", { name: /公开上架/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /检索/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /目录/ })).toHaveCount(0);
});

test("share link entry renders a read-only reader page without order or task actions", async ({ page }) => {
  await installStoreRoutes(page, { anchored: true });
  await page.goto(`/store?share=${ZHIXU_ID}`);

  await expect(page.getByTestId("store-share-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "装修后的展示名" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "这段协作按阶段推进" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "参与方与职责" })).toBeVisible();

  await expect(page.getByTestId("participant-app-page")).toHaveCount(0);
  await expect(page.getByTestId("task-confirm-button")).toHaveCount(0);
  await expect(page.getByTestId("submit-confirm-button")).toHaveCount(0);
  await expect(page.getByTestId("store-app")).toHaveCount(0);
});

test("join link entry asks an unanchored viewer to log in before submitting a join request", async ({ page }) => {
  await installStoreRoutes(page, { anchored: false });
  await page.goto(`/store?join=${ZHIXU_ID}`);

  await expect(page.getByTestId("store-join-link-view")).toBeVisible();
  await expect(page.getByTestId("store-join-link-login")).toBeVisible();
  await expect(page.getByTestId("store-join-entry")).toContainText("请先完成钱包登录后再提交");
  await expect(page.getByTestId("store-join-submit")).toHaveCount(0);
});
