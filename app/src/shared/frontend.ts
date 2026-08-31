export interface ShortHashOptions {
  readonly prefixLength?: number;
  readonly suffixLength?: number;
}

export interface FrontendRuntimeEnv {
  readonly [key: string]: string | boolean | undefined;
}

export function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

export function resolveFrontendApiBaseUrl(
  env: FrontendRuntimeEnv
): string | undefined {
  return normalizeBaseUrl(envValue(env, "VITE_UVP_CHAIN_SERVICES_URL"));
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

function envValue(env: FrontendRuntimeEnv, name: string): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
