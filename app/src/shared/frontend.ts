export interface ShortHashOptions {
  readonly prefixLength?: number;
  readonly suffixLength?: number;
}

export function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

/**
 * API 基地址来自构建期注入的静态值（import.meta.env.VITE_X 的静态成员访问，
 * Vite 构建时内联为字面量）。这里只接受已解析的字符串：传入整个 env 对象
 * 会把键名查找留在运行期，形成随包分发的环境开关（审计裁决 #31）。
 */
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
