import type { Page, Request, Route } from "@playwright/test";
import { expect, test } from "./mock-wallet";

const apiBase = "/__store-governance-api";
const planId = "0x1111111111111111111111111111111111111111111111111111111111111111";
const planHash = "0x2222222222222222222222222222222222222222222222222222222222222222";
const artifactHash = "0x3333333333333333333333333333333333333333333333333333333333333333";
const schemaHash = "0x4444444444444444444444444444444444444444444444444444444444444444";
const governanceTxHash = "0x5555555555555555555555555555555555555555555555555555555555555555";

type GovernanceFinalStatus = "active" | "revoked" | "stale";

test.describe("Store Governance Publishing Closure", () => {
  test("operator can import, compile, validate schema, submit review, and wait for governance admin", async ({ page }) => {
    await installStoreGovernanceApiMock(page);
    await page.goto(`/store?storeAccess=operator&storeApiBase=${encodeURIComponent(apiBase)}`);

    await completeStoreReview(page);

    await expect(page.getByTestId("store-governance-publishing")).toBeVisible();
    await expect(page.getByTestId("store-governance-status")).toContainText("approved_for_broadcast");
    // product-contract assertion: governance heading states the core invariant
    await expect(page.getByTestId("store-governance-heading")).toContainText("Review approved != chain attested");
    await expect(page.getByTestId("store-governance-state-note")).toHaveAttribute("data-state", "approved_for_broadcast");
    await expect(page.getByTestId("store-governance-admin-wait")).toHaveAttribute("data-state", "admin_wait");
    await expect(page.getByTestId("store-governance-admin-wait")).toBeVisible();
    await expect(page.getByTestId("store-trust-projection-state")).toHaveAttribute("data-projection-status", "not_requested");
    await expect(page.getByTestId("store-order-creatable-state")).toHaveAttribute("data-order-creatable", "blocked");
    await expect(page.getByTestId("store-request-attestation-button")).toHaveCount(0);
  });

  test("governance admin requests attestation and sees broadcasting, indexing, then active", async ({ page }) => {
    await installStoreGovernanceApiMock(page);
    await page.goto(`/store?storeAccess=admin&storeApiBase=${encodeURIComponent(apiBase)}`);

    await completeStoreReview(page);
    await expect(page.getByTestId("store-request-attestation-button")).toBeVisible();
    await page.getByTestId("store-confirm-draft-id-input").fill("draft-governance-publishing");
    await page.getByTestId("store-confirm-plan-id-input").fill(planId);
    await page.getByTestId("store-confirm-plan-hash-input").fill(planHash);

    await page.getByTestId("store-request-attestation-button").click();
    await expect(page.getByTestId("store-governance-status")).toContainText("broadcasting");
    await expect(page.getByTestId("store-governance-state-note")).toHaveAttribute("data-state", "broadcasting");
    await expect(page.getByTestId("store-governance-action-notice")).toHaveAttribute("data-phase", "pending");
    await expect(page.getByTestId("store-governance-status")).toContainText("indexing");
    await expect(page.getByTestId("store-governance-state-note")).toHaveAttribute("data-state", "indexing");
    await expect(page.getByTestId("store-governance-status")).toContainText("active");
    await expect(page.getByTestId("store-governance-state-note")).toHaveAttribute("data-state", "active");
    await expect(page.getByTestId("store-trust-projection-state")).toHaveAttribute("data-projection-status", "plan_attested_indexed");
    await expect(page.getByTestId("store-order-creatable-state")).toHaveAttribute("data-order-creatable", "yes");
    await expect(page.getByTestId("store-publishing-checklist-order-creatable")).toHaveAttribute("data-state", "done");

    // publishing-complete banner appears once draft is order-creatable
    await expect(page.getByTestId("store-publishing-complete")).toHaveAttribute("data-state", "container-ready");
    await expect(page.getByTestId("store-refresh-catalog-button")).toBeVisible();
  });

  test("publishing-complete banner absent when draft is not yet order-creatable, visible only after active+PlanAttested", async ({ page }) => {
    await installStoreGovernanceApiMock(page);
    await page.goto(`/store?storeAccess=admin&storeApiBase=${encodeURIComponent(apiBase)}`);

    // after import, before attestation request — banner must not appear
    await completeStoreReview(page);
    await expect(page.getByTestId("store-publishing-complete")).toHaveCount(0);
    await expect(page.getByTestId("store-order-creatable-state")).toHaveAttribute("data-order-creatable", "blocked");

    // after attestation request, banner must not appear until active+PlanAttested
    await fillAttestationConfirmation(page);
    await page.getByTestId("store-request-attestation-button").click();

    // during broadcasting/indexing — still no banner
    await expect(page.getByTestId("store-governance-status")).toContainText("broadcasting");
    await expect(page.getByTestId("store-publishing-complete")).toHaveCount(0);

    await expect(page.getByTestId("store-governance-status")).toContainText("indexing");
    await expect(page.getByTestId("store-publishing-complete")).toHaveCount(0);

    // once active+PlanAttested — banner appears
    await expect(page.getByTestId("store-governance-status")).toContainText("active");
    await expect(page.getByTestId("store-publishing-complete")).toHaveAttribute("data-state", "container-ready");
    await expect(page.getByTestId("store-refresh-catalog-button")).toBeVisible();
  });

  test("refresh catalog button calls /store/zhixus catalog refresh path", async ({ page }) => {
    await installStoreGovernanceApiMock(page);
    await page.goto(`/store?storeAccess=admin&storeApiBase=${encodeURIComponent(apiBase)}`);

    await completeStoreReview(page);
    await fillAttestationConfirmation(page);
    await page.getByTestId("store-request-attestation-button").click();
    await expect(page.getByTestId("store-governance-status")).toContainText("active");
    await expect(page.getByTestId("store-publishing-complete")).toHaveAttribute("data-state", "container-ready");

    // track the catalog refresh call triggered by clicking the refresh button
    const catalogRefreshPromise = page.waitForRequest(
      (request: Request) =>
        request.url().includes("/store/zhixus") &&
        request.method() === "GET"
    );
    await page.getByTestId("store-refresh-catalog-button").click();
    const refreshRequest = await catalogRefreshPromise;
    expect(refreshRequest.url()).toContain("/store/zhixus");
    expect(refreshRequest.method()).toBe("GET");
  });

  test("governance admin sees indexed PlanRevoked as blocked, not order-creatable", async ({ page }) => {
    await installStoreGovernanceApiMock(page, { finalStatus: "revoked" });
    await page.goto(`/store?storeAccess=admin&storeApiBase=${encodeURIComponent(apiBase)}`);

    await completeStoreReview(page);
    await fillAttestationConfirmation(page);
    await page.getByTestId("store-request-attestation-button").click();

    await expect(page.getByTestId("store-governance-status")).toContainText("revoked");
    await expect(page.getByTestId("store-governance-state-note")).toHaveAttribute("data-state", "revoked");
    await expect(page.getByTestId("store-trust-projection-state")).toHaveAttribute("data-projection-status", "plan_revoked");
    await expect(page.getByTestId("store-order-creatable-state")).toHaveAttribute("data-order-creatable", "blocked");
    // product-contract: PlanRevoked must be visible in the order-creatable gate
    await expect(page.getByTestId("store-order-creatable-state")).toContainText("PlanRevoked");
    await expect(page.getByTestId("store-publishing-checklist-projection")).toHaveAttribute("data-state", "blocked");
    await expect(page.getByTestId("store-publishing-checklist-order-creatable")).toHaveAttribute("data-state", "blocked");
    await expect(page.getByTestId("store-publishing-complete")).toHaveCount(0);
  });

  test("governance admin sees stale metadata/projection mismatch as blocked", async ({ page }) => {
    await installStoreGovernanceApiMock(page, { finalStatus: "stale" });
    await page.goto(`/store?storeAccess=admin&storeApiBase=${encodeURIComponent(apiBase)}`);

    await completeStoreReview(page);
    await fillAttestationConfirmation(page);
    await page.getByTestId("store-request-attestation-button").click();

    await expect(page.getByTestId("store-governance-status")).toContainText("stale");
    await expect(page.getByTestId("store-governance-state-note")).toHaveAttribute("data-state", "stale");
    await expect(page.getByTestId("store-trust-projection-state")).toHaveAttribute("data-projection-status", "metadata_mismatch");
    await expect(page.getByTestId("store-order-creatable-state")).toHaveAttribute("data-order-creatable", "blocked");
    await expect(page.getByTestId("store-publishing-checklist-projection")).toHaveAttribute("data-state", "blocked");
    await expect(page.getByTestId("store-publishing-checklist-order-creatable")).toHaveAttribute("data-state", "blocked");
    await expect(page.getByTestId("store-publishing-complete")).toHaveCount(0);
  });

  test("ordinary participant app does not expose Store controls or protocol publishing terms", async ({ page }) => {
    await page.goto("/app?demo=1");

    await expect(page.getByTestId("participant-app-page")).toBeVisible();
    await expect(page.getByTestId("store-app")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Store Console" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "导入草稿" })).toHaveCount(0);
    await expect(page.getByText("request-attestation")).toHaveCount(0);
    await expect(page.getByText("HookPlan")).toHaveCount(0);
    await expect(page.getByText("sourceId")).toHaveCount(0);
    await expect(page.getByText("signalId")).toHaveCount(0);
  });

  test("anonymous Store access hides write controls and write probes fail closed with 403", async ({ page }) => {
    await installStoreGovernanceApiMock(page);
    await page.goto(`/store?storeAccess=anonymous&storeApiBase=${encodeURIComponent(apiBase)}`);

    await expect(page.getByTestId("store-app")).toHaveAttribute("data-store-access", "anonymous_read");
    await expect(page.getByTestId("store-import-draft-button")).toHaveCount(0);
    await expect(page.getByTestId("store-request-attestation-button")).toHaveCount(0);

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

async function completeStoreReview(page: Page): Promise<void> {
  await expect(page.getByTestId("store-search-page")).toBeVisible();
  await page.getByPlaceholder("粘贴 Zhixu YAML 或 on-chain HookPlan manifest JSON").fill("name: governance-publishing-demo\n");
  await page.getByTestId("store-import-draft-button").click();
  await expect(page.getByTestId("store-import-action-notice")).toHaveAttribute("data-phase", "success");

  await page.getByRole("button", { name: /编译预览/ }).click();
  // compiled schema shows at least one inferred plugin in the slot list
  await expect(page.getByTestId("store-schema-slot-list").locator("[data-plugin-source='legacy_inferred']").first()).toBeVisible();
  await expect(page.getByTestId("store-schema-textarea-label")).toBeVisible();
  await expect(page.getByTestId("store-publishing-checklist-draft")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("store-publishing-checklist-compile")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("store-publishing-checklist-resource")).toHaveAttribute("data-state", "blocked");
  await expect(page.getByTestId("store-publishing-checklist-supplier-passport")).toHaveAttribute("data-state", "blocked");

  await page.getByRole("button", { name: /全部确认为 explicit/ }).click();
  await expect(page.getByTestId("store-schema-action-notice")).toHaveAttribute("data-phase", "success");
  await page.getByRole("button", { name: /^校验$/ }).click();
  await expect(page.getByTestId("store-schema-action-notice")).toHaveAttribute("data-phase", "success");
  await expect(page.getByTestId("store-publishing-checklist-resource")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("store-publishing-checklist-supplier-passport")).toHaveAttribute("data-state", "done");

  await page.getByRole("button", { name: /提交审核/ }).click();
  await expect(page.getByTestId("store-governance-status")).toContainText("approved_for_broadcast");
  await expect(page.getByTestId("store-publishing-checklist-store-review")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("store-publishing-checklist-governance-request")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("store-publishing-checklist-order-creatable")).toHaveAttribute("data-state", "blocked");
}

async function fillAttestationConfirmation(page: Page): Promise<void> {
  await page.getByTestId("store-confirm-draft-id-input").fill("draft-governance-publishing");
  await page.getByTestId("store-confirm-plan-id-input").fill(planId);
  await page.getByTestId("store-confirm-plan-hash-input").fill(planHash);
}

async function installStoreGovernanceApiMock(
  page: Page,
  options: { readonly finalStatus?: GovernanceFinalStatus } = {}
): Promise<void> {
  const finalStatus = options.finalStatus ?? "active";
  let draft = draftDto("imported");
  let productSchema = productSchemaDto("legacy_inferred", false);
  let attestationRequested = false;
  let draftPollsAfterRequest = 0;

  await page.route(`**${apiBase}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(apiBase, "");
    const method = request.method();

    if (method === "GET" && pathname === "/store/session") {
      const isAdmin = request.headers()["x-uvp-admin-role"] === "admin";
      const isOperator = request.headers()["x-uvp-store-role"] === "operator";
      await fulfillJson(route, 200, {
        session: isAdmin
          ? storeSession("store_admin", "dev_governance_admin_headers", [
            "store.read",
            "store.draft.import",
            "store.draft.compile",
            "store.draft.schema.save",
            "store.draft.review",
            "store.draft.attestation.request"
          ])
          : isOperator
            ? storeSession("store_operator", "dev_store_headers", [
              "store.read",
              "store.draft.import",
              "store.draft.compile",
              "store.draft.schema.save",
              "store.draft.review"
            ])
            : storeSession("anonymous_read", "anonymous", ["store.read"])
      });
      return;
    }

    if (method === "GET" && pathname === "/store/zhixus") {
      await fulfillJson(route, 200, storeCatalog());
      return;
    }

    if (method === "POST" && pathname === "/store/zhixu-drafts/import") {
      draft = draftDto("imported");
      await fulfillJson(route, 201, { draft });
      return;
    }

    if (method === "POST" && pathname === `/store/zhixu-drafts/${draft.draftId}/compile-preview`) {
      productSchema = productSchemaDto("legacy_inferred", false);
      draft = draftDto("compiled", productSchema);
      await fulfillJson(route, 200, { draft });
      return;
    }

    if (method === "GET" && pathname === `/store/zhixu-drafts/${draft.draftId}/product-schema`) {
      await fulfillJson(route, 200, { productSchema });
      return;
    }

    if (method === "PUT" && pathname === `/store/zhixu-drafts/${draft.draftId}/product-schema`) {
      const body = request.postDataJSON() as { readonly productSchema?: ReturnType<typeof productSchemaDto> };
      productSchema = {
        ...(body.productSchema ?? productSchema),
        validation: explicitValidation()
      };
      draft = draftDto("compiled", productSchema);
      await fulfillJson(route, 200, { draft, productSchema, validation: productSchema.validation });
      return;
    }

    if (method === "POST" && pathname === `/store/zhixu-drafts/${draft.draftId}/product-schema/validate`) {
      productSchema = {
        ...productSchema,
        validation: explicitValidation()
      };
      await fulfillJson(route, 200, { validation: productSchema.validation });
      return;
    }

    if (method === "POST" && pathname === `/store/zhixu-drafts/${draft.draftId}/submit-review`) {
      draft = {
        ...draftDto("approved_for_broadcast", productSchema),
        reviewId: "review-governance-publishing"
      };
      await fulfillJson(route, 200, { draft, review: { reviewId: draft.reviewId, status: "approved_for_broadcast" } });
      return;
    }

    if (method === "POST" && pathname === `/store/zhixu-drafts/${draft.draftId}/request-attestation`) {
      if (request.headers()["x-uvp-admin-role"] !== "admin") {
        await fulfillJson(route, 403, { error: "forbidden" });
        return;
      }
      const body = request.postDataJSON() as {
        readonly confirmation?: {
          readonly draftId?: string;
          readonly planId?: string;
          readonly planHash?: string;
        };
      };
      expect(body.confirmation).toMatchObject({
        draftId: draft.draftId,
        planId,
        planHash
      });
      attestationRequested = true;
      draftPollsAfterRequest = 0;
      draft = {
        ...draftDto("broadcasting", productSchema),
        reviewId: "review-governance-publishing",
        governanceTxLogId: "tx-log-governance-publishing"
      };
      await fulfillJson(route, 202, {
        draft,
        attestation: {
          request: { planId, planHash, artifactHash },
          log: { txLogId: draft.governanceTxLogId, status: "broadcasting", txHash: governanceTxHash }
        }
      });
      return;
    }

    if (method === "GET" && pathname === `/store/zhixu-drafts/${draft.draftId}`) {
      if (attestationRequested) {
        draftPollsAfterRequest += 1;
        const status = draftPollsAfterRequest < 4 ? "indexing" : finalStatus;
        draft = {
          ...draftDto(status, productSchema),
          reviewId: "review-governance-publishing",
          governanceTxLogId: "tx-log-governance-publishing"
        };
      }
      await fulfillJson(route, 200, { draft });
      return;
    }

    await fulfillJson(route, 404, { error: "not_found", pathname, method });
  });
}

function storeSession(accessLevel: string, authMode: string, capabilities: readonly string[]) {
  return {
    authenticated: accessLevel !== "anonymous_read",
    principalId: accessLevel === "anonymous_read" ? undefined : "store-e2e-session",
    accessLevel,
    roles: accessLevel === "store_admin" ? ["store_admin", "governance_admin"] : [accessLevel],
    capabilities,
    authMode
  };
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

function storeCatalog() {
  return {
    sourceOfTruth: "contracts-and-chain-events",
    summary: {
      totalZhixus: 1,
      activeZhixus: 0,
      needsReview: 1,
      revokedZhixus: 0,
      runningOrders: 0,
      openTasks: 0,
      trustedSuppliers: 0
    },
    zhixus: [
      {
        zhixuId: "zhixu-governance-publishing",
        title: "Governance Publishing Demo",
        subtitle: "fixture draft for Store governance closure",
        maintainer: "Store Ops",
        versionLabel: "v1",
        lifecycleStatus: "draft",
        lifecycleLabel: "设计草稿",
        reviewStatus: "unreviewed",
        reviewLabel: "未审核",
        riskLevel: "medium",
        stageCount: 1,
        roleSlotCount: 1,
        orderCount: 0,
        openTaskCount: 0,
        supplierCount: 0,
        planId,
        planHash,
        artifactHash,
        chainAttestation: {
          status: "not_found",
          label: "未链上背书",
          domainLabel: "official",
          planId,
          planHash,
          artifactHash
        },
        nextAction: "完成治理发布",
        updatedAt: "2026-04-30T00:00:00.000Z",
        proofRows: []
      }
    ]
  };
}

function draftDto(status: string, schema?: ReturnType<typeof productSchemaDto>) {
  const projection = projectionDto(status);
  return {
    draftId: "draft-governance-publishing",
    status,
    zhixuId: "zhixu-governance-publishing",
    title: "Governance Publishing Demo",
    maintainer: "Store Ops",
    compilePreview: status === "imported"
      ? undefined
      : {
          planId,
          planHash,
          artifactHash,
          stageCount: 1,
          roleSlotCount: 1,
          sourceCount: 1,
          signalCount: 1,
          canonicalArtifactHash: artifactHash
        },
    productSchema: schema,
    ...(projection ? { projection } : {}),
    errors: [],
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z"
  };
}

function projectionDto(status: string) {
  if (status === "broadcasting") {
    return {
      sourceOfTruth: "trust-registry-events",
      indexStatus: "broadcasting",
      eventName: "PlanAttested",
      planId,
      planHash,
      artifactHash,
      metadataMatches: true,
      txHash: governanceTxHash,
      message: "governance tx accepted for broadcast"
    };
  }
  if (status === "indexing") {
    return {
      sourceOfTruth: "trust-registry-events",
      indexStatus: "indexing",
      eventName: "PlanAttested",
      planId,
      planHash,
      artifactHash,
      metadataMatches: true,
      txHash: governanceTxHash,
      message: "waiting for PlanAttested projection"
    };
  }
  if (status === "active") {
    return {
      sourceOfTruth: "trust-registry-events",
      indexStatus: "indexed",
      eventName: "PlanAttested",
      planId,
      planHash,
      artifactHash,
      metadataMatches: true,
      txHash: governanceTxHash,
      blockNumber: "123456",
      indexedAt: "2026-04-30T00:01:00.000Z"
    };
  }
  if (status === "revoked") {
    return {
      sourceOfTruth: "trust-registry-events",
      indexStatus: "revoked",
      eventName: "PlanRevoked",
      planId,
      planHash,
      artifactHash,
      metadataMatches: true,
      txHash: governanceTxHash,
      blockNumber: "123457",
      indexedAt: "2026-04-30T00:02:00.000Z"
    };
  }
  if (status === "stale") {
    return {
      sourceOfTruth: "trust-registry-events",
      indexStatus: "stale",
      eventName: "MetadataMismatch",
      planId,
      planHash,
      artifactHash: "0x9999999999999999999999999999999999999999999999999999999999999999",
      metadataMatches: false,
      txHash: governanceTxHash,
      blockNumber: "123458",
      indexedAt: "2026-04-30T00:03:00.000Z",
      message: "metadata no longer matches projection"
    };
  }
  return undefined;
}

function productSchemaDto(pluginSource: "legacy_inferred" | "explicit", ok: boolean) {
  return {
    schemaVersion: "store-product-schema.v1",
    version: 1,
    zhixuId: "zhixu-governance-publishing",
    title: "Governance Publishing Demo",
    maintainer: "Store Ops",
    planId,
    planHash,
    artifactHash,
    roleSlots: [
      {
        slotId: "supplier",
        title: "供应商",
        label: "供应商",
        duty: "提交履约凭证",
        evidence: ["delivery_note"],
        status: "required",
        tone: "ok",
        required: true,
        performanceSlotLabel: "履约供应商",
        businessPersonaLabels: ["外贸供应商"],
        capabilityPlugins: [
          {
            pluginKind: "evidence_submission",
            source: pluginSource,
            stageIds: ["delivery"],
            title: "交付凭证",
            summary: "提交交付凭证 hash",
            primaryActionLabel: "提交凭证",
            requiredEvidence: ["delivery_note"]
          }
        ]
      }
    ],
    orderPermissionTable: [
      {
        permissionId: "permission.delivery.submit",
        roleSlotId: "supplier",
        stageId: "delivery",
        source: "supplier",
        signalName: "DELIVERY_SUBMITTED",
        payloadPolicy: "required",
        requiredEvidence: ["delivery_note"]
      }
    ],
    capabilityPlugins: [
      {
        pluginKind: "evidence_submission",
        source: pluginSource,
        stageIds: ["delivery"],
        title: "交付凭证",
        summary: "提交交付凭证 hash",
        primaryActionLabel: "提交凭证",
        requiredEvidence: ["delivery_note"]
      }
    ],
    businessPersonaLabels: ["外贸供应商"],
    stages: [
      {
        stageId: "delivery",
        index: 1,
        name: "交付",
        evidence: ["delivery_note"],
        ownerRole: "供应商",
        status: "pending"
      }
    ],
    schemaHash,
    validation: ok
      ? explicitValidation()
      : {
          ok: false,
          status: "inferred",
          issues: [
            {
              code: "capability_plugin_not_explicit",
              severity: "error",
              message: "legacy_inferred plugin must be confirmed",
              roleSlotId: "supplier"
            }
          ],
          checkedAt: "2026-04-30T00:00:00.000Z"
        },
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z"
  };
}

function explicitValidation() {
  return {
    ok: true,
    status: "explicit",
    issues: [],
    checkedAt: "2026-04-30T00:00:00.000Z"
  };
}
