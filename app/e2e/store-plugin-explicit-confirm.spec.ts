import { expect, test, type Page } from "@playwright/test";
import { STUB_API_BASE } from "./workbench-stubs";

/**
 * 能力插件逐条确认 e2e（fixture 模式，全桩）：
 * 《秩序商店》二.2——每一条 capability plugin 都必须由发布者逐条确认为显式。
 * - 顶层清单与每个插槽的插件（含 missing 态）都逐条呈现，各自独立勾选；
 * - 只有被勾选的条目写入 explicit，未勾选的 inferred 保持原状；
 * - "全选"只是快捷勾选，不绕过逐条展示。
 */

const DRAFT_ID = "draft-plugin-confirm-1";

function plugin(kind: string, source: "explicit" | "inferred" | "missing", stageIds: readonly string[] = ["stage-export"]) {
  return {
    pluginKind: kind,
    source,
    stageIds: [...stageIds],
    requiredEvidence: []
  };
}

function productSchemaWithPlugins(sources: { readonly slotA: "explicit" | "inferred"; readonly slotB: "explicit" | "inferred"; readonly top: "explicit" | "inferred" }) {
  return {
    schemaVersion: "store-product-schema.v1",
    version: 1,
    title: "插件逐条确认秩序",
    maintainer: "演示维护方",
    planId: "0x0000000000000000000000000000000000000000000000000000000000000101",
    planHash: "0xhash-a",
    artifactHash: "0xhash-b",
    roleSlots: [
      {
        slotId: "slot-delivery",
        title: "交付",
        label: "交付执行者",
        duty: "按约交付",
        evidence: [],
        status: "required",
        tone: "info",
        required: true,
        performanceSlotLabel: "交付执行者",
        businessPersonaLabels: ["物流"],
        capabilityPlugins: [
          plugin("delivery_update", sources.slotA),
          plugin("evidence_submission", sources.slotB)
        ]
      }
    ],
    orderPermissionTable: [
      { stageId: "stage-export", requiredEvidence: ["报关单"] }
    ],
    capabilityPlugins: [plugin("validation_confirm", sources.top)],
    businessPersonaLabels: ["物流"],
    stages: [
      { stageId: "stage-export", index: 0, name: "出口", evidence: [], ownerRole: "supplier", status: "pending" }
    ],
    schemaHash: "0xschema-hash",
    validation: { ok: false, issues: [{ code: "capability_plugin_not_explicit", severity: "error", message: "插件未逐条确认" }] },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z"
  };
}

function draftOf(productSchema: unknown) {
  return {
    draftId: DRAFT_ID,
    status: "compiled",
    title: "插件逐条确认秩序",
    maintainer: "演示维护方",
    errors: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    productSchema
  };
}

async function installPluginConfirmRoutes(page: Page): Promise<{ putSchemas: unknown[] }> {
  const putSchemas: unknown[] = [];
  await page.route(`${STUB_API_BASE}/store/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const fulfill = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (pathname === "/store/session" && method === "GET") {
      await fulfill({
        session: {
          authenticated: true,
          accessLevel: "store_operator",
          roles: ["store_operator"],
          capabilities: ["store.read", "store.draft.import", "store.draft.compile", "store.draft.schema.save"],
          authMode: "dev_store_headers"
        }
      });
      return;
    }
    if (pathname === "/store/zhixus" && method === "GET") {
      await fulfill({
        sourceOfTruth: "contracts-and-chain-events",
        summary: { totalZhixus: 0, activeZhixus: 0, needsReview: 0, runningOrders: 0, openTasks: 0, registeredSuppliers: 0 },
        zhixus: []
      });
      return;
    }
    if (pathname === "/store/zhixu-drafts/import" && method === "POST") {
      await fulfill({ draft: draftOf(productSchemaWithPlugins({ slotA: "explicit", slotB: "inferred", top: "inferred" })) }, 201);
      return;
    }
    if (pathname === `/store/zhixu-drafts/${DRAFT_ID}/product-schema` && method === "PUT") {
      const body = request.postDataJSON() as { readonly productSchema?: unknown };
      putSchemas.push(body.productSchema);
      const slotSources = body.productSchema?.roleSlots?.[0]?.capabilityPlugins ?? [];
      const allExplicit =
        slotSources.every((item) => item.source === "explicit") &&
        (body.productSchema?.capabilityPlugins ?? []).every((item) => item.source === "explicit");
      await fulfill({
        draft: draftOf(body.productSchema),
        productSchema: body.productSchema,
        validation: allExplicit
          ? { ok: true, issues: [] }
          : { ok: false, issues: [{ code: "capability_plugin_not_explicit", severity: "error", message: "仍有未确认插件" }] }
      });
      return;
    }
    await fulfill({ error: "not_found" }, 404);
  });
  return { putSchemas };
}

test("capability plugins are confirmed individually before being written as explicit", async ({ page }) => {
  const { putSchemas } = await installPluginConfirmRoutes(page);
  await page.goto("/store");

  // 导入草稿：返回 1 插槽 2 插件（explicit + inferred）+ 顶层 1 inferred。
  await page.getByRole("textbox", { name: "内容*" }).fill("zhixu: plugin-confirm");
  await page.getByTestId("store-import-draft-button").click();

  const panel = page.getByTestId("store-plugin-confirm-panel");
  await expect(panel).toBeVisible();
  const items = panel.getByTestId("store-plugin-confirm-item");
  await expect(items).toHaveCount(3);
  // 顶层与插槽插件都逐条呈现，来源如实标注。
  await expect(panel.locator('[data-plugin-scope="top-level"]')).toHaveCount(1);
  await expect(panel.locator('[data-plugin-scope="slot"]')).toHaveCount(2);
  await expect(items.nth(0)).toHaveAttribute("data-plugin-source", "explicit");
  await expect(items.nth(1)).toHaveAttribute("data-plugin-source", "inferred");
  await expect(items.nth(2)).toHaveAttribute("data-plugin-source", "inferred");
  await expect(panel.getByTestId("store-plugin-confirm-summary")).toHaveText("1/3 已确认");

  // 未勾选任何未确认插件时保存被禁用（explicit 预确认不额外写）。
  const save = page.getByTestId("store-plugin-confirm-save");
  await expect(save).toBeDisabled();

  // 只勾选插槽里的 evidence_submission：另两条不随之翻转。
  await items.nth(1).locator("input[type=checkbox]").check();
  await expect(panel.getByTestId("store-plugin-confirm-summary")).toHaveText("2/3 已确认");
  await save.click();

  // 顶层 inferred 尚未确认：服务端校验仍给阻断项，如实呈现（不是假成功）。
  const notice = page.getByTestId("store-schema-action-notice");
  await expect(notice).toHaveAttribute("data-phase", "error");
  await expect(notice).toContainText("阻断项");
  expect(putSchemas.length).toBeGreaterThan(0);
  const saved = putSchemas[0] as {
    readonly roleSlots: ReadonlyArray<{ readonly capabilityPlugins: ReadonlyArray<{ readonly pluginKind: string; readonly source: string }> }>;
    readonly capabilityPlugins: ReadonlyArray<{ readonly source: string }>;
  };
  // 只有被勾选的插件写入 explicit；未勾选的 inferred 保持原状。
  expect(saved.roleSlots[0]?.capabilityPlugins[0]?.source).toBe("explicit");
  expect(saved.roleSlots[0]?.capabilityPlugins[1]?.source).toBe("explicit");
  expect(saved.capabilityPlugins[0]?.source).toBe("inferred");

  // 全选只是快捷勾选：仍先逐条展示，勾选后可全部写入。
  await panel.getByTestId("store-plugin-confirm-select-all").click();
  await expect(panel.getByTestId("store-plugin-confirm-summary")).toHaveText("3/3 已确认");
  await page.getByTestId("store-plugin-confirm-save").click();
  await expect(page.getByTestId("store-schema-action-notice")).toHaveAttribute("data-phase", "success");
  const savedAll = putSchemas[1] as {
    readonly roleSlots: ReadonlyArray<{ readonly capabilityPlugins: ReadonlyArray<{ readonly source: string }> }>;
    readonly capabilityPlugins: ReadonlyArray<{ readonly source: string }>;
  };
  expect(savedAll.roleSlots[0]?.capabilityPlugins.every((item) => item.source === "explicit")).toBe(true);
  expect(savedAll.capabilityPlugins[0]?.source).toBe("explicit");
});
