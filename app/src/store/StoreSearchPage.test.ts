import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SlotCapabilityPluginDTO, StoreProductSchemaDTO } from "@uvp-eth/product-dto";
import { collectPluginReviewItems, confirmSchemaPluginsExplicit } from "./StoreSearchPage";

function plugin(kind: string, source: "explicit" | "inferred" | "missing", stageIds: readonly string[] = ["stage-export"]): SlotCapabilityPluginDTO {
  return {
    pluginKind: kind as SlotCapabilityPluginDTO["pluginKind"],
    source,
    stageIds: [...stageIds],
    requiredEvidence: []
  };
}

function schemaWithPlugins(input: {
  readonly slotPlugins: readonly SlotCapabilityPluginDTO[];
  readonly topLevelPlugins: readonly SlotCapabilityPluginDTO[];
}): StoreProductSchemaDTO {
  return {
    schemaVersion: "store-product-schema.v1",
    version: 1,
    title: "插件键控测试",
    maintainer: "测试维护方",
    planId: "0xplan",
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
        capabilityPlugins: [...input.slotPlugins]
      }
    ],
    orderPermissionTable: [],
    capabilityPlugins: [...input.topLevelPlugins],
    businessPersonaLabels: [],
    stages: [],
    schemaHash: "0xschema-hash",
    validation: { ok: false, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z"
  } as unknown as StoreProductSchemaDTO;
}

describe("plugin confirmation keys are keyed by plugin identity, not array index", () => {
  it("keeps each plugin's key stable when the JSON editor inserts a plugin in front of it", () => {
    const before = schemaWithPlugins({
      slotPlugins: [plugin("delivery_update", "inferred"), plugin("evidence_submission", "inferred")],
      topLevelPlugins: [plugin("validation_confirm", "inferred")]
    });
    const keysBefore = collectPluginReviewItems(before).map((item) => item.key);

    // 在槽位首位插入一条新插件：既有插件的下标全部 +1，内容身份不变。
    const after = schemaWithPlugins({
      slotPlugins: [plugin("payment_placeholder", "inferred"), plugin("delivery_update", "inferred"), plugin("evidence_submission", "inferred")],
      topLevelPlugins: [plugin("validation_confirm", "inferred")]
    });
    const keysAfter = collectPluginReviewItems(after).map((item) => item.key);

    assert.ok(keysAfter.includes(keysBefore[0] ?? ""), "原第一条插件的键在插入后应保持不变");
    assert.ok(keysAfter.includes(keysBefore[1] ?? ""), "原第二条插件的键在插入后应保持不变");
    assert.equal(keysAfter.length, 4);
  });

  it("writes explicit to the plugin the publisher checked even after reordering in the editor", () => {
    const before = schemaWithPlugins({
      slotPlugins: [plugin("delivery_update", "inferred"), plugin("evidence_submission", "inferred")],
      topLevelPlugins: []
    });
    // 发布者只勾选 evidence_submission（原下标 1）。
    const checkedKey = collectPluginReviewItems(before).find((item) => item.plugin.pluginKind === "evidence_submission")?.key;
    assert.ok(checkedKey, "应能取到 evidence_submission 的确认键");

    // JSON 编辑器里把两条插件调序后保存：按旧下标键控会写到错位的
    // delivery_update 上；按身份键控必须仍写中 evidence_submission。
    const edited = schemaWithPlugins({
      slotPlugins: [plugin("evidence_submission", "inferred"), plugin("delivery_update", "inferred")],
      topLevelPlugins: []
    });
    const confirmed = confirmSchemaPluginsExplicit(edited, new Set([checkedKey]));
    const slot = confirmed.roleSlots[0];
    assert.equal(slot?.capabilityPlugins?.[0]?.source, "explicit", "重排后仍应写中被勾选的插件");
    assert.equal(slot?.capabilityPlugins?.[0]?.pluginKind, "evidence_submission");
    assert.equal(slot?.capabilityPlugins?.[1]?.source, "inferred", "未勾选的插件保持原状");
  });

  it("distinguishes duplicate identical plugins within one slot by occurrence ordinal", () => {
    const twin = plugin("delivery_update", "inferred");
    const schema = schemaWithPlugins({ slotPlugins: [twin, { ...twin }], topLevelPlugins: [] });
    const keys = collectPluginReviewItems(schema).map((item) => item.key);
    assert.notEqual(keys[0], keys[1], "同槽内内容完全相同的插件必须可分别勾选");
  });

  it("does not change a plugin's key when its source flips to explicit on save", () => {
    const inferred = plugin("delivery_update", "inferred");
    const before = schemaWithPlugins({ slotPlugins: [inferred], topLevelPlugins: [] });
    const explicit = plugin("delivery_update", "explicit");
    const after = schemaWithPlugins({ slotPlugins: [explicit], topLevelPlugins: [] });
    assert.equal(
      collectPluginReviewItems(after)[0]?.key,
      collectPluginReviewItems(before)[0]?.key,
      "source 是写入结果不是身份：写入 explicit 后键漂移会让勾选状态错位"
    );
  });
});
