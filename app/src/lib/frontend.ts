export interface ShortHashOptions {
  readonly prefixLength?: number;
  readonly suffixLength?: number;
}

export function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

/* 前端工具函数：基地址解析只接受构建期注入的静态字符串。 */
export function resolveFrontendApiBaseUrl(
  configuredUrl: string | undefined
): string | undefined {
  return normalizeBaseUrl(configuredUrl);
}

export function shortHash(
  value: string,
  options: ShortHashOptions = {}
): string {
  const prefixLength = options.prefixLength ?? 10;
  const suffixLength = options.suffixLength ?? 8;
  const minimumLength = prefixLength + suffixLength;
  return value.length > minimumLength ? `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}` : value;
}

export function shortValue(value: string): string {
  return shortHash(value, { prefixLength: 8, suffixLength: 6 });
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
