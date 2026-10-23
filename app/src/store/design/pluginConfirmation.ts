import type { SlotCapabilityPluginDTO, StoreProductSchemaDTO } from "@uvp-eth/product-dto";


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
