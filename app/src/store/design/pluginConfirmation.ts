import type { SlotCapabilityPluginDTO, StoreProductSchemaDTO } from "@uvp-eth/product-dto";

/**
 * 能力插件逐条确认的纯函数单源：确认键按插件内容身份键控，不按数组下标。
 * Store 草稿的 Product Schema 可在 JSON 编辑器里插入/重排插件，下标键控会把
 * "保存勾选项为 explicit"写到另一条插件上；身份键控与展示顺序解耦。
 */

export type PluginReviewScope = "top-level" | "slot";

export interface PluginReviewItem {
  readonly key: string;
  readonly scope: PluginReviewScope;
  readonly slotId?: string;
  readonly slotLabel?: string;
  readonly plugin: SlotCapabilityPluginDTO;
}

function pluginIdentity(plugin: SlotCapabilityPluginDTO): string {
  return JSON.stringify([
    plugin.pluginKind,
    plugin.stageIds ?? [],
    plugin.title ?? "",
    plugin.summary ?? "",
    plugin.primaryActionLabel ?? "",
    plugin.requiredEvidence ?? [],
    plugin.inputPolicy ?? null
  ]);
}

function scopePluginReviewKeys(
  scope: PluginReviewScope,
  slotId: string | undefined,
  plugins: readonly SlotCapabilityPluginDTO[]
): readonly string[] {
  const occurrence = new Map<string, number>();
  return plugins.map((plugin) => {
    const identity = pluginIdentity(plugin);
    const seen = occurrence.get(identity) ?? 0;
    occurrence.set(identity, seen + 1);
    const prefix = scope === "top-level" ? "top-level" : `slot:${slotId ?? ""}`;
    return `${prefix}:${identity}#${seen}`;
  });
}

/** 顶层清单与每个插槽的插件全部逐条列出（含 missing），供发布者逐条确认。 */
export function collectPluginReviewItems(schema: StoreProductSchemaDTO): readonly PluginReviewItem[] {
  const slotPlugins = schema.roleSlots.flatMap((slot) => {
    const keys = scopePluginReviewKeys("slot", slot.slotId, slot.capabilityPlugins ?? []);
    return (slot.capabilityPlugins ?? []).map((plugin, index) => ({
      key: keys[index] ?? "",
      scope: "slot" as const,
      slotId: slot.slotId,
      slotLabel: slot.performanceSlotLabel ?? slot.label,
      plugin
    }));
  });
  const topLevelKeys = scopePluginReviewKeys("top-level", undefined, schema.capabilityPlugins);
  const topLevelPlugins = schema.capabilityPlugins.map((plugin, index) => ({
    key: topLevelKeys[index] ?? "",
    scope: "top-level" as const,
    plugin
  }));
  return [...slotPlugins, ...topLevelPlugins];
}

/**
 * 逐条确认状态跟随 schema 版本同步：服务端已判 explicit 的条目视为已确认，
 * 其余条目保留发布者在本轮编辑中的勾选（校验/保存不会清掉未提交的选择）。
 */
export function syncPluginConfirmations(
  schema: StoreProductSchemaDTO | undefined,
  current: Record<string, boolean>
): Record<string, boolean> {
  if (!schema) {
    return {};
  }
  const next: Record<string, boolean> = {};
  for (const item of collectPluginReviewItems(schema)) {
    next[item.key] = item.plugin.source === "explicit" ? true : current[item.key] ?? false;
  }
  return next;
}

export function confirmSchemaPluginsExplicit(
  schema: StoreProductSchemaDTO,
  confirmedKeys: ReadonlySet<string>
): StoreProductSchemaDTO {
  // 只把发布者逐条勾选的插件 source 改为 explicit：槽位插件与顶层插件清单的
  // 成员关系保持原样，不用槽位集合重建顶层清单（那会丢掉未挂在槽位上的顶层插件）。
  const roleSlots = schema.roleSlots.map((slot) => {
    const keys = scopePluginReviewKeys("slot", slot.slotId, slot.capabilityPlugins ?? []);
    return {
      ...slot,
      capabilityPlugins: (slot.capabilityPlugins ?? []).map((plugin, index) =>
        confirmedKeys.has(keys[index] ?? "")
          ? { ...plugin, source: "explicit" as const }
          : plugin
      )
    };
  });
  const topLevelKeys = scopePluginReviewKeys("top-level", undefined, schema.capabilityPlugins);
  return {
    ...schema,
    roleSlots,
    capabilityPlugins: schema.capabilityPlugins.map((plugin, index) =>
      confirmedKeys.has(topLevelKeys[index] ?? "")
        ? { ...plugin, source: "explicit" as const }
        : plugin
    )
  };
}
