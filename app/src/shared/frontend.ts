export interface ShortHashOptions {
  readonly prefixLength?: number;
  readonly suffixLength?: number;
}

export interface FrontendRuntimeEnv {
  readonly PROD?: boolean;
  readonly VITE_UVP_PRODUCT_E2E?: string;
  readonly [key: string]: string | boolean | undefined;
}

export interface FrontendDemoModeOptions {
  readonly queryKeys?: readonly string[];
  readonly storageKey?: string;
}

export function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

export function normalizeRuntimeEnv(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export function readQueryValue(name: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const value = new URLSearchParams(window.location.search).get(name)?.trim();
  return value ? value : undefined;
}

export function readLocalStorage(key: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const value = window.localStorage.getItem(key)?.trim();
    return value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function resolveFrontendRuntimeEnv(env: FrontendRuntimeEnv): string | undefined {
  return normalizeRuntimeEnv(envValue(env, "VITE_UVP_RUNTIME_ENV"));
}

export function isProductionLikeFrontendRuntime(env: FrontendRuntimeEnv): boolean {
  const runtime = resolveFrontendRuntimeEnv(env);
  if (runtime) {
    return runtime === "production" || runtime === "staging" || runtime === "testnet";
  }
  return env.PROD === true && env.VITE_UVP_PRODUCT_E2E !== "1";
}

export function resolveFrontendApiBaseUrl(
  env: FrontendRuntimeEnv
): string | undefined {
  return normalizeBaseUrl(envValue(env, "VITE_UVP_CHAIN_SERVICES_URL"));
}

export function isExplicitFrontendDemoMode(
  env: FrontendRuntimeEnv,
  options: FrontendDemoModeOptions = {}
): boolean {
  if (isProductionLikeFrontendRuntime(env)) {
    return false;
  }
  const enabled = envValue(env, "VITE_UVP_DEMO_MODE") === "1";
  return enabled && isFrontendDemoSourceSelected(env, options);
}

function isFrontendDemoSourceSelected(
  env: FrontendRuntimeEnv,
  options: FrontendDemoModeOptions
): boolean {
  if (
    envValue(env, "VITE_UVP_DEMO_SELECTED") === "1"
  ) {
    return true;
  }
  for (const key of options.queryKeys ?? ["demo"]) {
    const value = readQueryValue(key);
    if (value === "1" || value === "true" || value === "demo") {
      return true;
    }
  }
  if (readQueryValue("fallback") === "demo") {
    return true;
  }
  return options.storageKey ? readLocalStorage(options.storageKey) === "1" : false;
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
