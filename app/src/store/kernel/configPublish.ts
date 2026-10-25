/* 配置发布：config version 与已编译 plan 成对登记，校验失败不伪造成功。 */

export const ORDER_CONFIG_SCHEMA = "uvp.order-config/v3";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/u;

export interface ConfigPublishInput {
  readonly configId: string;
  readonly version: string;
  readonly planId: string;
  readonly planHash: string;
  readonly bundle: Readonly<Record<string, unknown>>;
  readonly status?: "draft" | "published" | undefined;
}

export interface ConfigPublishResult {
  readonly configId: string;
  readonly version: string;
  readonly status: string;
  readonly configHash: string;
  readonly planId?: string;
  readonly planHash?: string;
}

export type ConfigPublishOutcome =
  | { readonly kind: "published"; readonly value: ConfigPublishResult }
  | { readonly kind: "invalid"; readonly code: string; readonly message: string }
  | { readonly kind: "failed"; readonly status: number; readonly code?: string; readonly message: string };

export interface ConfigPublishPorts {
  readonly baseUrl: string;
  readonly sessionToken?: string | undefined;
  readonly fetcher?: typeof fetch | undefined;
  readonly timeoutMs?: number | undefined;
}

export function validateConfigPublish(input: ConfigPublishInput): { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string } {
  if (input.configId.trim().length === 0) {
    return { ok: false, code: "invalid_config_id", message: "configId 不能为空" };
  }
  if (input.version.trim().length === 0) {
    return { ok: false, code: "invalid_version", message: "version 不能为空" };
  }
  if (!BYTES32.test(input.planId) || !BYTES32.test(input.planHash)) {
    return { ok: false, code: "invalid_plan", message: "planId 与 planHash 必须是 0x 32 字节摘要（成对登记）" };
  }
  if (input.bundle.schema !== ORDER_CONFIG_SCHEMA) {
    return { ok: false, code: "invalid_schema", message: `bundle.schema 必须是 ${ORDER_CONFIG_SCHEMA}` };
  }
  if (input.bundle.configId !== input.configId || input.bundle.version !== input.version) {
    return { ok: false, code: "config_identity_mismatch", message: "bundle 的 configId/version 必须与发布参数一致" };
  }
  if (!Array.isArray(input.bundle.stages) || input.bundle.stages.length === 0) {
    return { ok: false, code: "invalid_stages", message: "bundle.stages 必须是非空数组" };
  }
  return { ok: true };
}

export async function publishConfig(
  input: ConfigPublishInput,
  ports: ConfigPublishPorts
): Promise<ConfigPublishOutcome> {
  const checked = validateConfigPublish(input);
  if (!checked.ok) {
    return { kind: "invalid", code: checked.code, message: checked.message };
  }
  const fetcher = ports.fetcher ?? globalThis.fetch.bind(globalThis);
  const signal = AbortSignal.timeout(ports.timeoutMs ?? 6000);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ports.sessionToken !== undefined) {
    headers["x-uvp-store-session"] = ports.sessionToken;
  }
  let response: Response;
  try {
    response = await fetcher(`${ports.baseUrl.replace(/\/+$/u, "")}/product/v3/configs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        config: input.bundle,
        status: input.status ?? "published",
        planId: input.planId,
        planHash: input.planHash
      }),
      redirect: "manual",
      signal
    });
  } catch (error) {
    return {
      kind: "failed",
      status: 0,
      message: `配置发布请求未送达：${error instanceof Error ? error.message : String(error)}`
    };
  }
  if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
    return { kind: "failed", status: response.status, code: "redirect_refused", message: "配置发布被重定向拒绝" };
  }
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text.length > 0 ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    return {
      kind: "failed",
      status: response.status,
      ...(typeof body.error === "string" ? { code: body.error } : {}),
      message: typeof body.message === "string" ? body.message : text || `HTTP ${response.status}`
    };
  }
  if (typeof body.configId !== "string" || typeof body.version !== "string" || typeof body.configHash !== "string") {
    return { kind: "failed", status: response.status, code: "invalid_response", message: "配置发布响应缺少 configId/version/configHash" };
  }
  return {
    kind: "published",
    value: {
      configId: body.configId,
      version: body.version,
      status: typeof body.status === "string" ? body.status : "published",
      configHash: body.configHash,
      ...(typeof body.planId === "string" ? { planId: body.planId } : {}),
      ...(typeof body.planHash === "string" ? { planHash: body.planHash } : {})
    }
  };
}
