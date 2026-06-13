import {
  storeConsoleSummary,
  summarizeZhixu,
  toStoreZhixuConsoleDTO,
  toStoreZhixuDetailDTO,
  type StoreSearchResponseDTO,
  type StoreSearchResultDTO,
  type StoreProductSchemaDTO,
  type StoreProductSchemaValidationDTO,
  type StoreZhixuConsoleDTO,
  type StoreZhixuDetailDTO
} from "@uvp-eth/product-dto";
import { demoZhixuDetail } from "@uvp-eth/product-dto/fixtures";
import type {
  StoreAccessLevel,
  StoreAccessState,
  StoreApiResult,
  StoreApiSource,
  StoreAuthMode,
  StoreCapability,
  StoreDockingSessionCreateDTO,
  StoreDockingSessionDTO,
  StoreDockingValidationInput,
  StoreDraftSignalMapEntryDTO,
  StoreImportZhixuDraftInput,
  StoreProductSchemaUpdateResultDTO,
  StoreRuntimeSummaryDTO,
  StoreSearchInput,
  StoreSessionDTO,
  StoreSupplierCapabilityUpdateInput,
  StoreSupplierDTO,
  StoreSupplierMutationResultDTO,
  StoreRole,
  StoreZhixuDraftAttestationInput,
  StoreZhixuDraftAttestationResultDTO,
  StoreZhixuDraftDTO,
  StoreZhixuDraftReviewResultDTO,
  StoreZhixuSearchResultDTO
} from "./types";
import {
  isExplicitFrontendDemoMode,
  isProductionLikeFrontendRuntime,
  isRecord,
  normalizeBaseUrl,
  readLocalStorage,
  readQueryValue,
  resolveFrontendApiBaseUrl,
  shortValue,
  stringValue
} from "../shared/frontend";

export interface StoreApiClient {
  readonly baseUrl?: string | undefined;
  readonly access: StoreAccessState;
  getSession(): Promise<StoreApiResult<StoreSessionDTO>>;
  search(query?: StoreSearchInput): Promise<StoreApiResult<StoreZhixuSearchResultDTO>>;
  getZhixuDetail(zhixuId: string): Promise<StoreApiResult<StoreZhixuDetailDTO>>;
  getZhixuDraft(draftId: string): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>>;
  importZhixuDraft(input: StoreImportZhixuDraftInput): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>>;
  compileZhixuDraft(draftId: string): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>>;
  getDraftProductSchema(draftId: string): Promise<StoreApiResult<StoreProductSchemaDTO>>;
  updateDraftProductSchema(
    draftId: string,
    productSchema: StoreProductSchemaDTO
  ): Promise<StoreApiResult<StoreProductSchemaUpdateResultDTO>>;
  validateDraftProductSchema(
    draftId: string,
    productSchema?: StoreProductSchemaDTO
  ): Promise<StoreApiResult<{ readonly validation: StoreProductSchemaValidationDTO }>>;
  submitZhixuDraftReview(draftId: string): Promise<StoreApiResult<StoreZhixuDraftReviewResultDTO>>;
  requestZhixuDraftAttestation(
    draftId: string,
    input: StoreZhixuDraftAttestationInput
  ): Promise<StoreApiResult<StoreZhixuDraftAttestationResultDTO>>;
  listSuppliers(): Promise<StoreApiResult<readonly StoreSupplierDTO[]>>;
  updateSupplierCapabilities(
    supplierId: string,
    input: StoreSupplierCapabilityUpdateInput
  ): Promise<StoreApiResult<StoreSupplierMutationResultDTO>>;
  getRuntimeSummary(): Promise<StoreApiResult<StoreRuntimeSummaryDTO>>;
  createDockingSession(input: StoreDockingSessionCreateDTO): Promise<StoreApiResult<StoreDockingSessionDTO>>;
  getDockingSession(sessionId: string): Promise<StoreApiResult<StoreDockingSessionDTO>>;
  validateDockingSession(sessionId: string, input: StoreDockingValidationInput): Promise<StoreApiResult<StoreDockingSessionDTO>>;
  saveDockingDraftMap(
    sessionId: string,
    draftSignalMap: readonly StoreDraftSignalMapEntryDTO[]
  ): Promise<StoreApiResult<StoreDockingSessionDTO>>;
}

const STORE_DEMO_MODE_STORAGE_KEY = "uvp.store.demoMode";
const STORE_ACCESS_STORAGE_KEY = "uvp.store.accessLevel";
const STORE_USER_ID_STORAGE_KEY = "uvp.store.userId";

const fallbackSource: StoreApiSource = {
  kind: "mock",
  reason: "Store 开发样例模式已显式开启，使用本地样例数据"
};

export class StoreApiError extends Error {
  readonly pathname: string;
  readonly status: number;
  readonly code?: string | undefined;
  readonly details?: unknown | undefined;

  constructor(pathname: string, status: number, message: string, options: { readonly code?: string | undefined; readonly details?: unknown | undefined } = {}) {
    super(message);
    this.name = "StoreApiError";
    this.pathname = pathname;
    this.status = status;
    this.code = options.code;
    this.details = options.details;
  }
}

class StoreApiUnavailableError extends Error {
  readonly pathname: string;

  constructor(pathname: string, message: string) {
    super(message);
    this.name = "StoreApiUnavailableError";
    this.pathname = pathname;
  }
}

export function createStoreApiClient(access: StoreAccessState = resolveStoreAccess()): StoreApiClient {
  const baseUrl = normalizeBaseUrl(resolveStoreApiBaseUrl());
  return new BrowserStoreApiClient(baseUrl, {
    access,
    demoMode: isExplicitStoreDemoMode()
  });
}

export function resolveStoreAccess(): StoreAccessState {
  const level = normalizeStoreAccessLevel(
    import.meta.env.VITE_UVP_STORE_ACCESS_LEVEL ??
      readQueryValue("storeAccess") ??
      readQueryValue("storeRole") ??
      readLocalStorage(STORE_ACCESS_STORAGE_KEY)
  ) ?? "anonymous_read";
  const userId = readQueryValue("storeUser") ??
    import.meta.env.VITE_UVP_STORE_USER_ID ??
    readLocalStorage(STORE_USER_ID_STORAGE_KEY) ??
    (level === "anonymous_read" ? undefined : "store-dev-session");

  return {
    level,
    label: accessLabel(level),
    roles: rolesForAccessLevel(level),
    capabilities: capabilitiesForAccessLevel(level),
    authMode: level === "anonymous_read" ? "anonymous" : "dev_store_headers",
    canRead: true,
    canWrite: hasWriteCapability(capabilitiesForAccessLevel(level)),
    canAdmin: capabilitiesForAccessLevel(level).includes("store.draft.attestation.request"),
    headers: accessHeaders(level, userId)
  };
}

export function accessFromStoreSession(session: StoreSessionDTO, fallback: StoreAccessState): StoreAccessState {
  const capabilities = session.capabilities;
  return {
    level: session.accessLevel,
    label: accessLabel(session.accessLevel),
    roles: session.roles,
    capabilities,
    authMode: session.authMode,
    canRead: true,
    canWrite: hasWriteCapability(capabilities),
    canAdmin: capabilities.includes("store.draft.attestation.request"),
    headers: fallback.headers
  };
}

export function readableStoreError(error: unknown, fallback: string): string {
  if (error instanceof StoreApiError) {
    if (error.status === 403) {
      return "403：当前 Store 访问状态没有写入权限";
    }
    if (error.status > 0) {
      return `${error.status}：${error.code ?? error.message}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

class BrowserStoreApiClient implements StoreApiClient {
  readonly baseUrl?: string | undefined;
  readonly access: StoreAccessState;
  readonly demoMode: boolean;

  constructor(baseUrl: string | undefined, options: { readonly access: StoreAccessState; readonly demoMode: boolean }) {
    this.baseUrl = baseUrl;
    this.access = options.access;
    this.demoMode = options.demoMode;
  }

  async getSession(): Promise<StoreApiResult<StoreSessionDTO>> {
    const pathname = "/store/session";
    if (!this.baseUrl) {
      return {
        data: sessionFromAccess(this.access),
        source: this.demoMode ? fallbackSource : { kind: "mock", reason: "Store API base URL is not configured" }
      };
    }
    return await this.realRead<StoreSessionDTO>("GET", pathname, (response) => sessionFromResponse(response, this.access));
  }

  async search(query: StoreSearchInput = {}): Promise<StoreApiResult<StoreZhixuSearchResultDTO>> {
    const keyword = query.keyword?.trim();
    const pathname = keyword ? `/store/search?${storeSearchParams({ ...query, keyword })}` : "/store/zhixus";
    return await this.withReadOrDemo(
      pathname,
      async () => {
        if (!keyword) {
          return await this.requestJson<StoreZhixuSearchResultDTO>("GET", "/store/zhixus");
        }
        const [catalog, search] = await Promise.all([
          this.requestJson<StoreZhixuSearchResultDTO>("GET", "/store/zhixus"),
          this.requestJson<StoreSearchResponseDTO>("GET", pathname)
        ]);
        return {
          ...catalog,
          search
        };
      },
      () => mockStoreSearchResult(keyword)
    );
  }

  async getZhixuDetail(zhixuId: string): Promise<StoreApiResult<StoreZhixuDetailDTO>> {
    const pathname = `/store/zhixus/${encodeURIComponent(zhixuId)}`;
    return await this.withReadOrDemo(
      pathname,
      async () => await this.requestJson<{ readonly zhixu: StoreZhixuDetailDTO }>("GET", pathname).then((response) => response.zhixu),
      () => mockStoreZhixu(zhixuId)
    );
  }

  async getZhixuDraft(draftId: string): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}`;
    return await this.realRead<{ readonly draft: StoreZhixuDraftDTO }>("GET", pathname, (response) => {
      const record = isRecord(response) ? response : {};
      if (!isRecord(record.draft)) {
        throw new StoreApiError(pathname, 0, "store_zhixu_draft_response_invalid");
      }
      return { draft: record.draft as unknown as StoreZhixuDraftDTO };
    });
  }

  async importZhixuDraft(input: StoreImportZhixuDraftInput): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>> {
    this.requireWriteAccess("/store/zhixu-drafts/import");
    return await this.realWrite<{ readonly draft: StoreZhixuDraftDTO }>("POST", "/store/zhixu-drafts/import", input);
  }

  async compileZhixuDraft(draftId: string): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/compile-preview`;
    this.requireWriteAccess(pathname);
    return await this.realWrite<{ readonly draft: StoreZhixuDraftDTO }>("POST", pathname);
  }

  async getDraftProductSchema(draftId: string): Promise<StoreApiResult<StoreProductSchemaDTO>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/product-schema`;
    return await this.realRead<StoreProductSchemaDTO>("GET", pathname, (response) => {
      const record = isRecord(response) ? response : {};
      return record.productSchema as StoreProductSchemaDTO;
    });
  }

  async updateDraftProductSchema(
    draftId: string,
    productSchema: StoreProductSchemaDTO
  ): Promise<StoreApiResult<StoreProductSchemaUpdateResultDTO>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/product-schema`;
    this.requireWriteAccess(pathname);
    return await this.realWrite<StoreProductSchemaUpdateResultDTO>("PUT", pathname, { productSchema });
  }

  async validateDraftProductSchema(
    draftId: string,
    productSchema?: StoreProductSchemaDTO
  ): Promise<StoreApiResult<{ readonly validation: StoreProductSchemaValidationDTO }>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/product-schema/validate`;
    return await this.realWrite<{ readonly validation: StoreProductSchemaValidationDTO }>(
      "POST",
      pathname,
      productSchema ? { productSchema } : undefined
    );
  }

  async submitZhixuDraftReview(draftId: string): Promise<StoreApiResult<StoreZhixuDraftReviewResultDTO>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/submit-review`;
    this.requireWriteAccess(pathname);
    return await this.realWrite<StoreZhixuDraftReviewResultDTO>("POST", pathname, {
      status: "approved_for_broadcast",
      publicSummary: "Store operator confirmed Product Schema Bundle."
    });
  }

  async requestZhixuDraftAttestation(
    draftId: string,
    input: StoreZhixuDraftAttestationInput
  ): Promise<StoreApiResult<StoreZhixuDraftAttestationResultDTO>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/request-attestation`;
    this.requireAdminAccess(pathname);
    return await this.realWrite<StoreZhixuDraftAttestationResultDTO>("POST", pathname, input);
  }

  async listSuppliers(): Promise<StoreApiResult<readonly StoreSupplierDTO[]>> {
    const pathname = "/store/suppliers";
    return await this.withReadOrDemo(
      pathname,
      async () => await this.requestJson<{ readonly suppliers: readonly unknown[] }>("GET", pathname)
        .then((response) => response.suppliers.map(storeSupplierFromTrustProjection)),
      () => mockSuppliers()
    );
  }

  async updateSupplierCapabilities(
    supplierId: string,
    input: StoreSupplierCapabilityUpdateInput
  ): Promise<StoreApiResult<StoreSupplierMutationResultDTO>> {
    const pathname = `/store/suppliers/${encodeURIComponent(supplierId)}/review`;
    this.requireCapability(pathname, "store.supplier.tags.update");
    this.requireCapability(pathname, "store.supplier.review");
    return await this.realWrite<unknown>("POST", pathname, {
      ...input,
      publicSummary: "Store operator updated non-authoritative supplier capability metadata.",
      confirmation: {
        supplierId
      }
    }).then((result) => ({
      data: supplierMutationResultFromResponse(pathname, result.data),
      source: result.source
    }));
  }

  async getRuntimeSummary(): Promise<StoreApiResult<StoreRuntimeSummaryDTO>> {
    const pathname = "/store/runtime/summary";
    return await this.withReadOrDemo(
      pathname,
      async () => await this.requestJson<unknown>("GET", pathname).then(runtimeSummaryFromResponse),
      () => mockRuntimeSummary()
    );
  }

  async createDockingSession(input: StoreDockingSessionCreateDTO): Promise<StoreApiResult<StoreDockingSessionDTO>> {
    this.requireWriteAccess("/store/docking-sessions");
    return await this.realWrite("POST", "/store/docking-sessions", input)
      .then((result) => ({ data: dockingSessionFromResponse(result.data), source: result.source }));
  }

  async getDockingSession(sessionId: string): Promise<StoreApiResult<StoreDockingSessionDTO>> {
    const pathname = `/store/docking-sessions/${encodeURIComponent(sessionId)}`;
    return await this.realRead("GET", pathname)
      .then((result) => ({ data: dockingSessionFromResponse(result.data), source: result.source }));
  }

  async validateDockingSession(
    sessionId: string,
    input: StoreDockingValidationInput
  ): Promise<StoreApiResult<StoreDockingSessionDTO>> {
    const pathname = `/store/docking-sessions/${encodeURIComponent(sessionId)}/validate`;
    this.requireWriteAccess(pathname);
    return await this.realWrite("POST", pathname, input)
      .then((result) => ({ data: dockingSessionFromResponse(result.data), source: result.source }));
  }

  async saveDockingDraftMap(
    sessionId: string,
    draftSignalMap: readonly StoreDraftSignalMapEntryDTO[]
  ): Promise<StoreApiResult<StoreDockingSessionDTO>> {
    const pathname = `/store/docking-sessions/${encodeURIComponent(sessionId)}/save-draft-map`;
    this.requireWriteAccess(pathname);
    return await this.realWrite("POST", pathname, { draftSignalMap })
      .then((result) => ({ data: dockingSessionFromResponse(result.data), source: result.source }));
  }

  private async withReadOrDemo<TData>(
    pathname: string,
    request: () => Promise<TData>,
    fallback: () => TData
  ): Promise<StoreApiResult<TData>> {
    if (!this.baseUrl) {
      if (this.demoMode) {
        return { data: fallback(), source: fallbackSource };
      }
      throw new StoreApiError(pathname, 0, "Store API base URL is not configured");
    }

    try {
      return {
        data: await request(),
        source: { kind: "real", baseUrl: this.baseUrl }
      };
    } catch (error) {
      throw error;
    }
  }

  private async realRead<TData = unknown>(
    method: "GET",
    pathname: string,
    transform?: (response: unknown) => TData
  ): Promise<StoreApiResult<TData>> {
    const response = await this.requestJson<unknown>(method, pathname);
    return {
      data: transform ? transform(response) : response as TData,
      source: { kind: "real", baseUrl: this.requireBaseUrl(pathname) }
    };
  }

  private async realWrite<TData = unknown>(
    method: "POST" | "PUT",
    pathname: string,
    body?: unknown
  ): Promise<StoreApiResult<TData>> {
    return {
      data: await this.requestJson<TData>(method, pathname, body),
      source: { kind: "real", baseUrl: this.requireBaseUrl(pathname) }
    };
  }

  private async requestJson<TResponse>(method: string, pathname: string, body?: unknown): Promise<TResponse> {
    const baseUrl = this.requireBaseUrl(pathname);
    return await fetchStoreJson<TResponse>(baseUrl, pathname, {
      method,
      body,
      headers: this.access.headers
    });
  }

  private requireBaseUrl(pathname: string): string {
    if (!this.baseUrl) {
      throw new StoreApiError(pathname, 0, "Store API base URL is not configured");
    }
    return this.baseUrl;
  }

  private requireWriteAccess(pathname: string): void {
    if (!this.access.canWrite) {
      throw new StoreApiError(pathname, 403, "forbidden", { code: "forbidden" });
    }
  }

  private requireAdminAccess(pathname: string): void {
    if (!this.access.canAdmin) {
      throw new StoreApiError(pathname, 403, "forbidden", { code: "forbidden" });
    }
  }

  private requireCapability(pathname: string, capability: StoreCapability): void {
    if (!this.access.capabilities.includes(capability)) {
      throw new StoreApiError(pathname, 403, "forbidden", { code: "forbidden", details: { requiredCapability: capability } });
    }
  }
}

async function fetchStoreJson<TResponse>(
  baseUrl: string,
  pathname: string,
  init: { readonly method: string; readonly body?: unknown; readonly headers?: Readonly<Record<string, string>> }
): Promise<TResponse> {
  const headers = new Headers(init.headers);
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method: init.method,
      headers,
      ...(body !== undefined ? { body } : {})
    });
  } catch (error) {
    throw new StoreApiUnavailableError(pathname, error instanceof Error ? error.message : "network_error");
  }

  if (!response.ok) {
    const parsed = await readStoreError(response);
    throw new StoreApiError(pathname, response.status, parsed.message, {
      code: parsed.code,
      details: parsed.details
    });
  }
  return await response.json() as TResponse;
}

async function readStoreError(response: Response): Promise<{ readonly code?: string; readonly message: string; readonly details?: unknown }> {
  try {
    const body = await response.json() as { readonly error?: string; readonly message?: string; readonly details?: unknown };
    const code = body.error;
    return {
      ...(code ? { code } : {}),
      message: body.message ?? body.error ?? `${response.status}`,
      ...(body.details !== undefined ? { details: body.details } : {})
    };
  } catch {
    return { message: `${response.status}` };
  }
}

function dockingSessionFromResponse(response: unknown): StoreDockingSessionDTO {
  const record = isRecord(response) ? response : undefined;
  const session = record && isRecord(record.session) ? record.session : record;
  if (!isRecord(session)) {
    throw new StoreApiError("/store/docking-sessions", 0, "docking_session_response_invalid");
  }
  return session as unknown as StoreDockingSessionDTO;
}

function mockStoreSearchResult(keyword?: string): StoreZhixuSearchResultDTO {
  const zhixus = [
    toStoreZhixuConsoleDTO(summarizeZhixu(demoZhixuDetail), {
      orderCount: 1,
      openTaskCount: 1,
      supplierCount: 1
    })
  ];
  return {
    sourceOfTruth: "contracts-and-chain-events",
    summary: storeConsoleSummary(zhixus),
    zhixus,
    ...(keyword ? { search: mockTypedStoreSearch(keyword, zhixus) } : {})
  };
}

function mockTypedStoreSearch(
  keyword: string,
  zhixus: readonly StoreZhixuConsoleDTO[]
): StoreSearchResponseDTO {
  const normalizedQuery = keyword.trim().toLowerCase();
  const zhixuResults: StoreSearchResultDTO[] = zhixus
    .filter((zhixu) =>
      [zhixu.zhixuId, zhixu.title, zhixu.subtitle, zhixu.maintainer, zhixu.lifecycleLabel]
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    )
    .map((zhixu) => ({
      resultType: "zhixu",
      id: zhixu.zhixuId,
      title: zhixu.title,
      subtitle: zhixu.subtitle,
      badgeLabel: zhixu.lifecycleLabel,
      statusLabel: zhixu.chainAttestation.label,
      matchedFields: ["title"],
      primaryHref: `/store/zhixus/${encodeURIComponent(zhixu.zhixuId)}`,
      sourceOfTruth: zhixu.chainAttestation.status === "attested" ? "chain" : "chain-and-store-metadata",
      proofHint: shortValue(zhixu.planHash),
      updatedAt: zhixu.updatedAt
    }));
  return {
    sourceOfTruth: "contracts-and-chain-events",
    query: keyword,
    normalizedQuery,
    resultCount: zhixuResults.length,
    results: zhixuResults
  };
}

function mockStoreZhixu(zhixuId: string): StoreZhixuDetailDTO {
  const row = mockStoreSearchResult().zhixus.find((item) => item.zhixuId === zhixuId);
  if (!row) {
    throw new StoreApiError(`/store/zhixus/${zhixuId}`, 404, "store_zhixu_not_found", { code: "store_zhixu_not_found" });
  }
  return toStoreZhixuDetailDTO(row, demoZhixuDetail);
}

function mockRuntimeSummary(): StoreRuntimeSummaryDTO {
  const search = mockStoreSearchResult();
  return {
    activeZhixus: search.summary.activeZhixus,
    runningOrders: search.summary.runningOrders,
    openTasks: search.summary.openTasks,
    trustedSuppliers: search.summary.trustedSuppliers,
    sourceOfTruth: search.sourceOfTruth
  };
}

function storeSearchParams(query: StoreSearchInput): string {
  const params = new URLSearchParams();
  if (query.keyword?.trim()) {
    params.set("q", query.keyword.trim());
  }
  if (query.type) {
    params.set("type", query.type);
  }
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  return params.toString();
}

function runtimeSummaryFromResponse(response: unknown): StoreRuntimeSummaryDTO {
  const record = requiredStoreRecord(response, "/store/runtime/summary", "store_runtime_summary_response_invalid");
  return {
    activeZhixus: requiredStoreNumber(record.activeZhixuCount, "/store/runtime/summary", "store_runtime_summary_response_invalid"),
    runningOrders: requiredStoreNumber(record.runningOrderCount, "/store/runtime/summary", "store_runtime_summary_response_invalid"),
    openTasks: requiredStoreNumber(record.openTaskCount, "/store/runtime/summary", "store_runtime_summary_response_invalid"),
    trustedSuppliers: requiredStoreNumber(record.trustedSupplierCount, "/store/runtime/summary", "store_runtime_summary_response_invalid"),
    sourceOfTruth: "contracts-and-chain-events"
  };
}

function mockSuppliers(): readonly StoreSupplierDTO[] {
  return [
    {
      supplierId: "demo-customs-broker",
      supplierSubjectId: "0x0000000000000000000000000000000000000000000000000000000000003001",
      displayName: "演示报关执行方",
      wallet: "0x4444444444444444444444444444444444444444",
      trustStatus: "attested",
      trustLabel: "已链上背书",
      capabilityTags: ["customs", "document-verification"],
      supportedRoleSlotIds: ["customs-broker"],
      supportedStageIds: ["export.customs"],
      registryAddresses: ["0x2222222222222222222222222222222222222222"],
      recentOrderCount: 1,
      openTaskCount: 1,
      reviewStatus: "approved_for_broadcast",
      proofRows: [
        { label: "链上事件", value: "SupplierAttested" },
        { label: "Supplier Subject", value: "0x0000000000000000000000000000000000000000000000000000000000003001" }
      ],
      nextAction: "可进入候选匹配；新订单仍需显式参与授权",
      updatedAt: "demo"
    }
  ];
}

function storeSupplierFromTrustProjection(value: unknown): StoreSupplierDTO {
  const record = isRecord(value) ? value : {};
  const supplierId = stringValue(record.supplierId) ?? stringValue(record.supplierSubjectId) ?? stringValue(record.subjectId) ?? "unknown-supplier";
  const supplierSubjectId = stringValue(record.supplierSubjectId) ?? stringValue(record.subjectId) ?? supplierId;
  const wallet = stringValue(record.wallet);
  const trustStatus = stringValue(record.trustStatus);
  const revoked = Boolean(record.revoked) || trustStatus === "revoked";
  const capabilityTags = Array.isArray(record.capabilityTags)
    ? record.capabilityTags.filter((item): item is string => typeof item === "string")
    : [];
  const supportedRoleSlotIds = arrayOfStrings(record.supportedRoleSlotIds);
  const supportedStageIds = arrayOfStrings(record.supportedStageIds);
  const registryAddresses = arrayOfStrings(record.registryAddresses);
  const reviewStatus = supplierReviewStatusValue(stringValue(record.reviewStatus));
  return {
    supplierId,
    supplierSubjectId,
    displayName: stringValue(record.displayName) ?? stringValue(record.trustLabel) ?? shortValue(supplierId),
    ...(wallet ? { wallet } : {}),
    ...(record.notificationProfile !== undefined ? { notificationProfile: record.notificationProfile } : {}),
    ...(stringValue(record.notificationProfileHash) ? { notificationProfileHash: stringValue(record.notificationProfileHash) } : {}),
    ...(stringValue(record.notificationUpdatedAt) ? { notificationUpdatedAt: stringValue(record.notificationUpdatedAt) } : {}),
    trustStatus: revoked ? "revoked" : trustStatus === "not_found" ? "not_found" : "attested",
    trustLabel: stringValue(record.trustLabel) ?? (revoked ? "链上背书已撤销" : trustStatus === "not_found" ? "未发现链上背书" : "已链上背书"),
    capabilityTags,
    supportedRoleSlotIds,
    supportedStageIds,
    registryAddresses,
    recentOrderCount: numberValue(record.recentOrderCount) ?? 0,
    openTaskCount: numberValue(record.openTaskCount) ?? 0,
    reviewStatus,
    ...(stringValue(record.metadataURI) ? { metadataURI: stringValue(record.metadataURI) } : {}),
    proofRows: proofRowsFromResponse(record.proofRows),
    nextAction: stringValue(record.nextAction) ?? "Store metadata 仅用于候选筛选；链上 trust 以 Trust Registry 投影为准。",
    updatedAt: stringValue(record.updatedAt) ?? ""
  };
}

function supplierMutationResultFromResponse(pathname: string, response: unknown): StoreSupplierMutationResultDTO {
  const record = isRecord(response) ? response : {};
  if (!isRecord(record.supplier)) {
    throw new StoreApiError(pathname, 0, "store_supplier_response_invalid");
  }
  return {
    supplier: storeSupplierFromTrustProjection(record.supplier),
    ...(record.governance !== undefined ? { governance: record.governance } : {})
  };
}

function requiredStoreRecord(value: unknown, pathname: string, code: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new StoreApiError(pathname, 0, code, { code });
  }
  return value;
}

function requiredStoreNumber(value: unknown, pathname: string, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StoreApiError(pathname, 0, code, { code });
  }
  return value;
}

function proofRowsFromResponse(value: unknown): StoreSupplierDTO["proofRows"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const label = stringValue(item.label);
    const proofValue = stringValue(item.value);
    return label && proofValue ? [{ label, value: proofValue }] : [];
  });
}

function supplierReviewStatusValue(value: string | undefined): StoreSupplierDTO["reviewStatus"] {
  switch (value) {
    case "draft":
    case "submitted":
    case "approved_for_broadcast":
    case "rejected":
    case "revoked":
      return value;
    default:
      return "draft";
  }
}

function accessHeaders(level: StoreAccessLevel, userId: string | undefined): Readonly<Record<string, string>> {
  if (level === "store_admin") {
    const adminId = userId ?? "store-admin";
    return {
      "x-uvp-store-user-id": adminId,
      "x-uvp-store-role": "admin",
      "x-uvp-store-operator-id": adminId,
      "x-uvp-store-operator-role": "admin",
      "x-uvp-admin-id": adminId,
      "x-uvp-admin-role": "admin"
    };
  }
  if (level === "store_operator") {
    const operatorId = userId ?? "store-operator";
    return {
      "x-uvp-store-user-id": operatorId,
      "x-uvp-store-role": "operator",
      "x-uvp-store-operator-id": operatorId,
      "x-uvp-store-operator-role": "operator"
    };
  }
  if (level === "store_read") {
    return {
      "x-uvp-store-user-id": userId ?? "store-reader",
      "x-uvp-store-role": "read"
    };
  }
  return {};
}

function accessLabel(level: StoreAccessLevel): string {
  switch (level) {
    case "store_admin":
      return "Store Admin";
    case "store_operator":
      return "Store Operator";
    case "store_read":
      return "Store Read";
    case "anonymous_read":
      return "匿名只读";
  }
}

function rolesForAccessLevel(level: StoreAccessLevel): readonly StoreRole[] {
  switch (level) {
    case "store_admin":
      return ["store_admin", "governance_admin"];
    case "store_operator":
      return ["store_operator"];
    case "store_read":
      return ["store_read"];
    case "anonymous_read":
      return ["anonymous_read"];
  }
}

function capabilitiesForAccessLevel(level: StoreAccessLevel): readonly StoreCapability[] {
  const publicRead = ["store.read"] as const satisfies readonly StoreCapability[];
  const read = [...publicRead, "store.audit.read"] as const satisfies readonly StoreCapability[];
  const operator = [
    ...read,
    "store.draft.import",
    "store.draft.compile",
    "store.draft.schema.save",
    "store.draft.review",
    "store.supplier.create",
    "store.supplier.review",
    "store.supplier.tags.update",
    "store.docking.create",
    "store.docking.validate",
    "store.docking.save"
  ] as const satisfies readonly StoreCapability[];
  const admin = [
    ...operator,
    "store.version.activate",
    "store.version.deprecate",
    "store.draft.attestation.request",
    "store.version.revocation.request",
    "store.supplier.attestation.request",
    "store.supplier.revocation.request"
  ] as const satisfies readonly StoreCapability[];
  switch (level) {
    case "store_admin":
      return admin;
    case "store_operator":
      return operator;
    case "store_read":
      return read;
    case "anonymous_read":
      return publicRead;
  }
}

function hasWriteCapability(capabilities: readonly StoreCapability[]): boolean {
  return capabilities.some((capability) => capability !== "store.read" && capability !== "store.audit.read");
}

function sessionFromAccess(access: StoreAccessState): StoreSessionDTO {
  return {
    authenticated: access.level !== "anonymous_read",
    accessLevel: access.level,
    roles: access.roles,
    capabilities: access.capabilities,
    authMode: access.authMode
  };
}

function sessionFromResponse(response: unknown, fallback: StoreAccessState): StoreSessionDTO {
  const record = isRecord(response) ? response : {};
  const session = isRecord(record.session) ? record.session : record;
  const accessLevel = normalizeStoreAccessLevel(stringValue(session.accessLevel)) ?? fallback.level;
  const principalId = stringValue(session.principalId);
  const roles = arrayOfStrings(session.roles).filter(isStoreRole);
  const capabilities = arrayOfStrings(session.capabilities).filter(isStoreCapability);
  const authMode = authModeValue(stringValue(session.authMode)) ?? fallback.authMode;
  return {
    authenticated: Boolean(session.authenticated) || Boolean(principalId),
    ...(principalId ? { principalId } : {}),
    accessLevel,
    roles: roles.length > 0 ? roles : rolesForAccessLevel(accessLevel),
    capabilities: capabilities.length > 0 ? capabilities : capabilitiesForAccessLevel(accessLevel),
    authMode
  };
}

function arrayOfStrings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function authModeValue(value: string | undefined): StoreAuthMode | undefined {
  switch (value) {
    case "anonymous":
    case "dev_store_headers":
    case "dev_governance_admin_headers":
    case "dev_headers_disabled":
    case "jwt":
      return value;
    default:
      return undefined;
  }
}

function isStoreRole(value: string): value is StoreRole {
  return value === "anonymous_read" ||
    value === "store_read" ||
    value === "store_reader" ||
    value === "store_operator" ||
    value === "store_admin" ||
    value === "governance_admin";
}

function isStoreCapability(value: string): value is StoreCapability {
  return capabilitiesForAccessLevel("store_admin").includes(value as StoreCapability);
}

function normalizeStoreAccessLevel(value: string | undefined): StoreAccessLevel | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "admin" || normalized === "store_admin") {
    return "store_admin";
  }
  if (normalized === "operator" || normalized === "store_operator") {
    return "store_operator";
  }
  if (normalized === "read" || normalized === "reader" || normalized === "store_read") {
    return "store_read";
  }
  if (normalized === "anonymous" || normalized === "anonymous_read") {
    return "anonymous_read";
  }
  return undefined;
}

function isExplicitStoreDemoMode(): boolean {
  return isExplicitFrontendDemoMode(import.meta.env, {
    demoEnabledAliases: ["VITE_UVP_STORE_DEMO_MODE", "VITE_UVP_PRODUCT_DEMO_MODE"],
    demoSelectedAliases: ["VITE_UVP_STORE_DEMO_SELECTED", "VITE_UVP_PRODUCT_DEMO_SELECTED"],
    queryKeys: ["demo", "storeDemo"],
    storageKey: STORE_DEMO_MODE_STORAGE_KEY
  });
}

function resolveStoreApiBaseUrl(): string | undefined {
  const configured = resolveFrontendApiBaseUrl(import.meta.env, ["VITE_PRODUCT_API_BASE_URL"]);
  if (configured) {
    return configured;
  }
  if (isProductionLikeFrontendRuntime(import.meta.env)) {
    return undefined;
  }
  return readQueryValue("storeApiBase") ?? readLocalStorage("uvp.store.apiBaseUrl");
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
