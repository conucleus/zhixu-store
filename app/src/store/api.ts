import {
  type StoreSearchResponseDTO,
  type StoreProductSchemaDTO,
  type StoreProductSchemaValidationDTO,
  type StoreZhixuDetailDTO,
} from "@uvp-eth/product-dto";
import type {
  StoreAccessLevel,
  StoreAccessState,
  StoreApiResult,
  StoreAccountAddressView,
  StoreAuthMode,
  StoreDecorationDataView,
  StoreDecorationView,
  StoreDockingSessionCreateDTO,
  StoreDockingSessionDTO,
  StoreImportZhixuDraftInput,
  StoreJoinApplicationDetailView,
  StoreJoinApplicationSubmitInput,
  StoreJoinApplicationStatus,
  StoreJoinApplicationView,
  StoreListingStatus,
  StoreListingView,
  StoreProductSchemaUpdateResultDTO,
  StorePublisherDelegationView,
  StoreRuntimeSummaryDTO,
  StoreSearchInput,
  StoreSessionDTO,
  StoreSupplierCapabilityUpdateInput,
  StoreSupplierDTO,
  StoreSupplierMutationResultDTO,
  StoreRole,
  StoreWalletSessionChallengeDTO,
  StoreWalletSessionVerifyResult,
  StoreZhixuDraftDTO,
  StoreZhixuDraftReviewResultDTO,
  StoreZhixuOverlayView,
  StoreZhixuSearchResultDTO,
} from "./types";
import {
  isRecord,
  resolveFrontendApiBaseUrl,
  shortValue,
  stringValue,
} from "../lib/frontend";

export interface StoreApiClient {
  readonly baseUrl?: string | undefined;
  readonly access: StoreAccessState;
  getSession(): Promise<StoreApiResult<StoreSessionDTO>>;
  search(
    query?: StoreSearchInput,
  ): Promise<StoreApiResult<StoreZhixuSearchResultDTO>>;
  getZhixuDetail(zhixuId: string): Promise<StoreApiResult<StoreZhixuDetailDTO>>;
  getZhixuDetailWithOverlay(
    zhixuId: string,
  ): Promise<StoreApiResult<{ readonly zhixu: StoreZhixuDetailDTO; readonly overlay?: StoreZhixuOverlayView | undefined }>>;
  getZhixuDraft(
    draftId: string,
  ): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>>;
  importZhixuDraft(
    input: StoreImportZhixuDraftInput,
  ): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>>;
  compileZhixuDraft(
    draftId: string,
  ): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>>;
  getDraftProductSchema(
    draftId: string,
  ): Promise<StoreApiResult<StoreProductSchemaDTO>>;
  updateDraftProductSchema(
    draftId: string,
    productSchema: StoreProductSchemaDTO,
  ): Promise<StoreApiResult<StoreProductSchemaUpdateResultDTO>>;
  validateDraftProductSchema(
    draftId: string,
    productSchema?: StoreProductSchemaDTO,
  ): Promise<
    StoreApiResult<{ readonly validation: StoreProductSchemaValidationDTO }>
  >;
  submitZhixuDraftReview(
    draftId: string,
  ): Promise<StoreApiResult<StoreZhixuDraftReviewResultDTO>>;
  listSuppliers(): Promise<StoreApiResult<readonly StoreSupplierDTO[]>>;
  updateSupplierCapabilities(
    supplierId: string,
    input: StoreSupplierCapabilityUpdateInput,
  ): Promise<StoreApiResult<StoreSupplierMutationResultDTO>>;
  getRuntimeSummary(): Promise<StoreApiResult<StoreRuntimeSummaryDTO>>;
  createDockingSession(
    input: StoreDockingSessionCreateDTO,
  ): Promise<StoreApiResult<StoreDockingSessionDTO>>;
  getDockingSession(
    sessionId: string,
  ): Promise<StoreApiResult<StoreDockingSessionDTO>>;
  authChallenge(
    input: { readonly address: string; readonly intent?: "login" | "anchor_address" },
  ): Promise<StoreApiResult<StoreWalletSessionChallengeDTO>>;
  authVerify(
    input: { readonly nonce: string; readonly signature: string },
  ): Promise<StoreApiResult<StoreWalletSessionVerifyResult>>;
  authLogout(): Promise<StoreApiResult<{ readonly revoked: boolean }>>;
  listAccountAddresses(): Promise<
    StoreApiResult<{ readonly accountId: string; readonly addresses: readonly { readonly address: string; readonly status: "active" | "revoked"; readonly anchoredAt: string }[] }>
  >;
  revokeAccountAddress(address: string): Promise<StoreApiResult<{ readonly accountId: string; readonly addresses: readonly { readonly address: string; readonly status: "active" | "revoked"; readonly anchoredAt: string }[] }>>;
  saveDecoration(planId: string, decoration: StoreDecorationDataView, note?: string): Promise<StoreApiResult<StoreDecorationView>>;
  restoreDecorationVersion(planId: string, version: number): Promise<StoreApiResult<StoreDecorationView>>;
  listDelegations(publisherAddress: string): Promise<StoreApiResult<{ readonly delegations: readonly StorePublisherDelegationView[] }>>;
  grantDelegation(publisherAddress: string, memberAddress: string): Promise<StoreApiResult<{ readonly delegations: readonly StorePublisherDelegationView[] }>>;
  revokeDelegation(delegationId: string, reason?: string): Promise<StoreApiResult<{ readonly delegations: readonly StorePublisherDelegationView[] }>>;
  importListing(
    input: { readonly planId: string; readonly planHash?: string | undefined; readonly deploymentId?: string | undefined },
  ): Promise<StoreApiResult<{ readonly listing: StoreListingView; readonly anchorVerification: { readonly status: string; readonly checks: readonly { readonly id: string; readonly outcome: string }[] } }>>;
  listListings(status?: StoreListingStatus): Promise<StoreApiResult<{ readonly listings: readonly StoreListingView[] }>>;
  reviewListing(listingId: string, decision: "approve" | "reject", note?: string): Promise<StoreApiResult<{ readonly listing: StoreListingView }>>;
  delistListing(listingId: string, reason?: string): Promise<StoreApiResult<{ readonly listing: StoreListingView }>>;
  relistListing(listingId: string): Promise<StoreApiResult<{ readonly listing: StoreListingView }>>;
  submitJoinApplication(input: StoreJoinApplicationSubmitInput): Promise<StoreApiResult<StoreJoinApplicationDetailView>>;
  listJoinApplications(query?: { readonly planId?: string; readonly status?: StoreJoinApplicationStatus }): Promise<StoreApiResult<{ readonly applications: readonly StoreJoinApplicationDetailView[] }>>;
  getJoinApplication(applicationId: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>>;
  joinReviewStart(applicationId: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>>;
  joinApprove(applicationId: string, note?: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>>;
  joinReject(applicationId: string, reason: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>>;
  joinRevoke(applicationId: string, reason?: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>>;
}

export class StoreApiError extends Error {
  readonly pathname: string;
  readonly status: number;
  readonly code?: string | undefined;
  readonly details?: unknown | undefined;

  constructor(
    pathname: string,
    status: number,
    message: string,
    options: {
      readonly code?: string | undefined;
      readonly details?: unknown | undefined;
    } = {},
  ) {
    super(message);
    this.name = "StoreApiError";
    this.pathname = pathname;
    this.status = status;
    this.code = options.code;
    this.details = options.details;
  }
}

const STORE_FETCH_TIMEOUT_MS = Number(
  (import.meta.env ?? {})?.VITE_UVP_STORE_FETCH_TIMEOUT_MS
) || 6000;

class StoreApiUnavailableError extends Error {
  readonly pathname: string;

  constructor(pathname: string, message: string) {
    super(message);
    this.name = "StoreApiUnavailableError";
    this.pathname = pathname;
  }
}

export function createStoreApiClient(
  access: StoreAccessState = resolveStoreAccess(),
): StoreApiClient {
  return new BrowserStoreApiClient(resolveStoreApiBaseUrl(), {
    access,
    sessionToken: readStoredStoreSessionToken
  });
}

export const STORE_SESSION_TOKEN_STORAGE_KEY = "uvp-store-session-token";

interface StoredStoreSession {
  readonly token: string;
  readonly expiresAt: string;
}

export function readStoredStoreSessionToken(): string | undefined {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORE_SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return undefined;
  }
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredStoreSession>;
    const token = typeof parsed.token === "string" && parsed.token.startsWith("uvs_") ? parsed.token : undefined;
    const expiresAt = Date.parse(parsed.expiresAt ?? "");
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      window.localStorage.removeItem(STORE_SESSION_TOKEN_STORAGE_KEY);
      return undefined;
    }
    return token;
  } catch {
    window.localStorage.removeItem(STORE_SESSION_TOKEN_STORAGE_KEY);
    return undefined;
  }
}

export function storeStoreSessionToken(
  session: StoredStoreSession | undefined,
): void {
  try {
    if (session) {
      window.localStorage.setItem(STORE_SESSION_TOKEN_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORE_SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {
  }
}

export function configuredStoreAccessLevel(): StoreAccessLevel | undefined {
  const value = import.meta.env.VITE_UVP_STORE_ACCESS_LEVEL;
  return normalizeStoreAccessLevel(
    typeof value === "string" ? value : undefined,
  );
}

function configuredStoreUserId(): string | undefined {
  const value = import.meta.env.VITE_UVP_STORE_USER_ID;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function resolveStoreAccess(): StoreAccessState {
  const level = configuredStoreAccessLevel() ?? "anonymous_read";
  const userId = configuredStoreUserId();

  return {
    level,
    label: accessLabel(level),
    roles: rolesForAccessLevel(level),
    authMode: level === "anonymous_read" ? "anonymous" : "dev_store_headers",
    canWrite: canWriteForLevel(level),
    canAdmin: level === "store_admin",
    headers: accessHeaders(level, userId),
  };
}

export function accessFromStoreSession(
  session: StoreSessionDTO,
  fallback: StoreAccessState,
): StoreAccessState {
  return {
    level: session.accessLevel,
    label: accessLabel(session.accessLevel),
    roles: session.roles,
    authMode: session.authMode,
    canWrite: session.canWrite,
    canAdmin: session.canAdmin,
    headers: fallback.headers,
    ...(session.anchoredAddress ? { anchoredAddress: session.anchoredAddress } : {}),
    ...(session.anchorSource === "wallet_session" || session.anchorSource === "dev_header"
      ? { anchorSource: session.anchorSource }
      : {}),
  };
}

export function readableStoreError(error: unknown, fallback: string): string {
  if (error instanceof StoreApiError) {
    if (error.status === 403) {
      return "403：当前 Store 访问状态没有写入权限";
    }
    if (error.status > 0) {
      if (error.status === 409) {
        return `409：请求与服务端当前状态冲突（${error.code ?? "conflict"}），请刷新后重试`;
      }
      return `${error.status}：${error.code ?? error.message}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

export class BrowserStoreApiClient implements StoreApiClient {
  readonly baseUrl?: string | undefined;
  readonly access: StoreAccessState;
  readonly #sessionToken: (() => string | undefined) | undefined;
  readonly #fetchImpl: typeof fetch;

  constructor(
    baseUrl: string | undefined,
    options: {
      readonly access: StoreAccessState;
      readonly sessionToken?: (() => string | undefined) | undefined;
      readonly fetchImpl?: typeof fetch;
    },
  ) {
    this.baseUrl = baseUrl;
    this.access = options.access;
    this.#sessionToken = options.sessionToken;
    this.#fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async getSession(): Promise<StoreApiResult<StoreSessionDTO>> {
    const pathname = "/store/session";
    return await this.realRead<StoreSessionDTO>("GET", pathname, (response) =>
      sessionFromResponse(response, this.access),
    );
  }

  async search(
    query: StoreSearchInput = {},
  ): Promise<StoreApiResult<StoreZhixuSearchResultDTO>> {
    const keyword = query.keyword?.trim();
    const pathname = keyword
      ? `/store/search?${storeSearchParams({ ...query, keyword })}`
      : "/store/zhixus";
    return await this.withRead(pathname, async () => {
      if (!keyword) {
        return await this.requestJson<StoreZhixuSearchResultDTO>(
          "GET",
          "/store/zhixus",
        );
      }
      const [catalog, search] = await Promise.all([
        this.requestJson<StoreZhixuSearchResultDTO>("GET", "/store/zhixus"),
        this.requestJson<StoreSearchResponseDTO>("GET", pathname),
      ]);
      return {
        ...catalog,
        search,
      };
    });
  }

  async getZhixuDetail(
    zhixuId: string,
  ): Promise<StoreApiResult<StoreZhixuDetailDTO>> {
    const pathname = `/store/zhixus/${encodeURIComponent(zhixuId)}`;
    return await this.withRead(pathname, async () =>
      await this.requestJson<{ readonly zhixu: StoreZhixuDetailDTO; readonly storeOverlay?: unknown }>(
        "GET",
        pathname,
      ).then((response) => response.zhixu),
    );
  }

  async getZhixuDetailWithOverlay(
    zhixuId: string,
  ): Promise<StoreApiResult<{ readonly zhixu: StoreZhixuDetailDTO; readonly overlay?: StoreZhixuOverlayView | undefined }>> {
    const pathname = `/store/zhixus/${encodeURIComponent(zhixuId)}`;
    return await this.withRead(pathname, async () => {
      const response = await this.requestJson<{
        readonly zhixu: StoreZhixuDetailDTO;
        readonly storeOverlay?: StoreZhixuOverlayView;
      }>("GET", pathname);
      return {
        zhixu: response.zhixu,
        ...(response.storeOverlay ? { overlay: response.storeOverlay } : {}),
      };
    });
  }

  async getZhixuDraft(
    draftId: string,
  ): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}`;
    return await this.realRead<{ readonly draft: StoreZhixuDraftDTO }>(
      "GET",
      pathname,
      (response) => {
        const record = isRecord(response) ? response : {};
        if (!isRecord(record.draft)) {
          throw new StoreApiError(
            pathname,
            0,
            "store_zhixu_draft_response_invalid",
          );
        }
        return { draft: record.draft as unknown as StoreZhixuDraftDTO };
      },
    );
  }

  async importZhixuDraft(
    input: StoreImportZhixuDraftInput,
  ): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>> {
    this.requireWriteAccess("/store/zhixu-drafts/import");
    return await this.realWrite<{ readonly draft: StoreZhixuDraftDTO }>(
      "POST",
      "/store/zhixu-drafts/import",
      input,
    );
  }

  async compileZhixuDraft(
    draftId: string,
  ): Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/compile-preview`;
    this.requireWriteAccess(pathname);
    return await this.realWrite<{ readonly draft: StoreZhixuDraftDTO }>(
      "POST",
      pathname,
    );
  }

  async getDraftProductSchema(
    draftId: string,
  ): Promise<StoreApiResult<StoreProductSchemaDTO>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/product-schema`;
    return await this.realRead<StoreProductSchemaDTO>(
      "GET",
      pathname,
      (response) => {
        const record = isRecord(response) ? response : {};
        if (!isRecord(record.productSchema)) {
          throw new StoreApiError(
            pathname,
            0,
            "store_product_schema_response_invalid",
          );
        }
        return record.productSchema as unknown as StoreProductSchemaDTO;
      },
    );
  }

  async updateDraftProductSchema(
    draftId: string,
    productSchema: StoreProductSchemaDTO,
  ): Promise<StoreApiResult<StoreProductSchemaUpdateResultDTO>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/product-schema`;
    this.requireWriteAccess(pathname);
    return await this.realWrite<StoreProductSchemaUpdateResultDTO>(
      "PUT",
      pathname,
      { productSchema },
    );
  }

  async validateDraftProductSchema(
    draftId: string,
    productSchema?: StoreProductSchemaDTO,
  ): Promise<
    StoreApiResult<{ readonly validation: StoreProductSchemaValidationDTO }>
  > {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/product-schema/validate`;
    this.requireWriteAccess(pathname);
    return await this.realWrite<{
      readonly validation: StoreProductSchemaValidationDTO;
    }>("POST", pathname, productSchema ? { productSchema } : undefined);
  }

  async submitZhixuDraftReview(
    draftId: string,
  ): Promise<StoreApiResult<StoreZhixuDraftReviewResultDTO>> {
    const pathname = `/store/zhixu-drafts/${encodeURIComponent(draftId)}/submit-review`;
    this.requireWriteAccess(pathname);
    return await this.realWrite<StoreZhixuDraftReviewResultDTO>(
      "POST",
      pathname,
      {},
    );
  }

  async listSuppliers(): Promise<StoreApiResult<readonly StoreSupplierDTO[]>> {
    const pathname = "/store/suppliers";
    return await this.withRead(pathname, async () =>
      await this.requestJson<{ readonly suppliers: readonly unknown[] }>(
        "GET",
        pathname,
      ).then((response) =>
        response.suppliers.map((item) =>
          storeSupplierFromResponse(item, pathname),
        ),
      ),
    );
  }

  async updateSupplierCapabilities(
    supplierId: string,
    input: StoreSupplierCapabilityUpdateInput,
  ): Promise<StoreApiResult<StoreSupplierMutationResultDTO>> {
    const pathname = `/store/suppliers/${encodeURIComponent(supplierId)}/review`;
    this.requireWriteAccess(pathname);
    return await this.realWrite<unknown>("POST", pathname, {
      ...input,
      publicSummary:
        "Store operator updated non-authoritative supplier metadata.",
      confirmation: {
        supplierId,
      },
    }).then((result) => ({
      data: supplierMutationResultFromResponse(pathname, result.data),
      source: result.source,
    }));
  }

  async getRuntimeSummary(): Promise<StoreApiResult<StoreRuntimeSummaryDTO>> {
    const pathname = "/store/runtime/summary";
    return await this.withRead(pathname, async () =>
      await this.requestJson<unknown>("GET", pathname).then(
        parseStoreRuntimeSummary,
      ),
    );
  }

  async createDockingSession(
    input: StoreDockingSessionCreateDTO,
  ): Promise<StoreApiResult<StoreDockingSessionDTO>> {
    this.requireWriteAccess("/store/docking-sessions");
    return await this.realWrite("POST", "/store/docking-sessions", input).then(
      (result) => ({
        data: parseStoreDockingSession(result.data),
        source: result.source,
      }),
    );
  }

  async getDockingSession(
    sessionId: string,
  ): Promise<StoreApiResult<StoreDockingSessionDTO>> {
    const pathname = `/store/docking-sessions/${encodeURIComponent(sessionId)}`;
    return await this.realRead("GET", pathname).then((result) => ({
      data: parseStoreDockingSession(result.data, pathname),
      source: result.source,
    }));
  }

  async authChallenge(
    input: { readonly address: string; readonly intent?: "login" | "anchor_address" },
  ): Promise<StoreApiResult<StoreWalletSessionChallengeDTO>> {
    const pathname = "/store/auth/challenge";
    const result = await this.realWrite<{ readonly challenge?: StoreWalletSessionChallengeDTO } | StoreWalletSessionChallengeDTO>("POST", pathname, {
      address: input.address,
      ...(input.intent ? { intent: input.intent } : {}),
    });
    const payload = result.data;
    const challenge = payload && typeof payload === "object" && "challenge" in payload
      ? (payload as { readonly challenge: StoreWalletSessionChallengeDTO }).challenge
      : (payload as StoreWalletSessionChallengeDTO);
    if (!challenge || typeof challenge.nonce !== "string" || typeof challenge.message !== "string") {
      throw new StoreApiError(pathname, 0, "store_challenge_response_invalid");
    }
    return { data: challenge, source: result.source };
  }

  async authVerify(
    input: { readonly nonce: string; readonly signature: string },
  ): Promise<StoreApiResult<StoreWalletSessionVerifyResult>> {
    const pathname = "/store/auth/verify";
    return await this.realWrite<StoreWalletSessionVerifyResult>("POST", pathname, input);
  }

  async authLogout(): Promise<StoreApiResult<{ readonly revoked: boolean }>> {
    const pathname = "/store/auth/logout";
    return await this.realWrite<{ readonly revoked: boolean }>("POST", pathname, {});
  }

  async listAccountAddresses(): Promise<
    StoreApiResult<{ readonly accountId: string; readonly addresses: readonly { readonly address: string; readonly status: "active" | "revoked"; readonly anchoredAt: string }[] }>
  > {
    const pathname = "/store/auth/addresses";
    return await this.withRead(pathname, async () =>
      await this.requestJson<{ readonly accountId: string; readonly addresses: { readonly address: string; readonly status: "active" | "revoked"; readonly anchoredAt: string }[] }>("GET", pathname),
    );
  }

  async revokeAccountAddress(address: string): Promise<
    StoreApiResult<{ readonly accountId: string; readonly addresses: { readonly address: string; readonly status: "active" | "revoked"; readonly anchoredAt: string }[] }>
  > {
    const pathname = "/store/auth/addresses/revoke";
    this.requireAnchoredSession(pathname);
    return await this.realWrite<{ readonly accountId: string; readonly addresses: { readonly address: string; readonly status: "active" | "revoked"; readonly anchoredAt: string }[] }>("POST", pathname, { address });
  }

  async saveDecoration(planId: string, decoration: StoreDecorationDataView, note?: string): Promise<StoreApiResult<StoreDecorationView>> {
    const pathname = `/store/decoration/${encodeURIComponent(planId)}`;
    this.requireAnchoredSession(pathname);
    return await this.realWrite<StoreDecorationView>("PUT", pathname, { decoration, ...(note ? { note } : {}) });
  }

  async restoreDecorationVersion(planId: string, version: number): Promise<StoreApiResult<StoreDecorationView>> {
    const pathname = `/store/decoration/${encodeURIComponent(planId)}/versions/${version}/restore`;
    this.requireAnchoredSession(pathname);
    return await this.realWrite<StoreDecorationView>("POST", pathname, {});
  }

  async listDelegations(publisherAddress: string): Promise<StoreApiResult<{ readonly delegations: readonly StorePublisherDelegationView[] }>> {
    const pathname = `/store/publishers/${encodeURIComponent(publisherAddress)}/delegations`;
    return await this.withRead(pathname, async () =>
      await this.requestJson<{ readonly delegations: StorePublisherDelegationView[] }>("GET", pathname),
    );
  }

  async grantDelegation(publisherAddress: string, memberAddress: string): Promise<StoreApiResult<{ readonly delegations: readonly StorePublisherDelegationView[] }>> {
    const pathname = "/store/publishers/delegations";
    this.requireAnchoredSession(pathname);
    return await this.realWrite<{ readonly delegations: StorePublisherDelegationView[] }>("POST", pathname, {
      publisherAddress,
      memberAddress,
    });
  }

  async revokeDelegation(delegationId: string, reason?: string): Promise<StoreApiResult<{ readonly delegations: readonly StorePublisherDelegationView[] }>> {
    const pathname = `/store/publishers/delegations/${encodeURIComponent(delegationId)}/revoke`;
    this.requireAnchoredSession(pathname);
    return await this.realWrite<{ readonly delegations: StorePublisherDelegationView[] }>("POST", pathname, {
      ...(reason ? { reason } : {}),
    });
  }

  async importListing(
    input: { readonly planId: string; readonly planHash?: string | undefined; readonly deploymentId?: string | undefined },
  ): Promise<StoreApiResult<{ readonly listing: StoreListingView; readonly anchorVerification: { readonly status: string; readonly checks: readonly { readonly id: string; readonly outcome: string }[] } }>> {
    const pathname = "/store/listings/import";
    this.requireAnchoredSession(pathname);
    return await this.realWrite<{ readonly listing: StoreListingView; readonly anchorVerification: { readonly status: string; readonly checks: readonly { readonly id: string; readonly outcome: string }[] } }>("POST", pathname, input);
  }

  async listListings(status?: StoreListingStatus): Promise<StoreApiResult<{ readonly listings: readonly StoreListingView[] }>> {
    const pathname = "/store/listings";
    return await this.withRead(pathname, async () =>
      await this.requestJson<{ readonly listings: StoreListingView[] }>("GET", status ? `${pathname}?status=${status}` : pathname),
    );
  }

  async reviewListing(listingId: string, decision: "approve" | "reject", note?: string): Promise<StoreApiResult<{ readonly listing: StoreListingView }>> {
    const pathname = `/store/listings/${encodeURIComponent(listingId)}/review`;
    this.requireWriteAccess(pathname);
    this.requireAnchoredSession(pathname);
    return await this.realWrite<{ readonly listing: StoreListingView }>("POST", pathname, {
      decision,
      ...(note ? { note } : {}),
    });
  }

  async delistListing(listingId: string, reason?: string): Promise<StoreApiResult<{ readonly listing: StoreListingView }>> {
    const pathname = `/store/listings/${encodeURIComponent(listingId)}/delist`;
    this.requireWriteAccess(pathname);
    this.requireAnchoredSession(pathname);
    return await this.realWrite<{ readonly listing: StoreListingView }>("POST", pathname, {
      ...(reason ? { reason } : {}),
    });
  }

  async relistListing(listingId: string): Promise<StoreApiResult<{ readonly listing: StoreListingView }>> {
    const pathname = `/store/listings/${encodeURIComponent(listingId)}/relist`;
    this.requireWriteAccess(pathname);
    this.requireAnchoredSession(pathname);
    return await this.realWrite<{ readonly listing: StoreListingView }>("POST", pathname, {});
  }

  async submitJoinApplication(input: StoreJoinApplicationSubmitInput): Promise<StoreApiResult<StoreJoinApplicationDetailView>> {
    const pathname = "/store/join-applications";
    this.requireAnchoredSession(pathname);
    return await this.realWrite<StoreJoinApplicationDetailView>("POST", pathname, input);
  }

  async listJoinApplications(query?: { readonly planId?: string; readonly status?: StoreJoinApplicationStatus }): Promise<StoreApiResult<{ readonly applications: readonly StoreJoinApplicationDetailView[] }>> {
    const pathname = "/store/join-applications";
    const params = new URLSearchParams();
    if (query?.planId) {
      params.set("planId", query.planId);
    }
    if (query?.status) {
      params.set("status", query.status);
    }
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    return await this.withRead(pathname, async () =>
      await this.requestJson<{ readonly applications: StoreJoinApplicationDetailView[] }>("GET", `${pathname}${qs}`),
    );
  }

  async getJoinApplication(applicationId: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>> {
    const pathname = `/store/join-applications/${encodeURIComponent(applicationId)}`;
    return await this.withRead(pathname, async () => await this.requestJson<StoreJoinApplicationDetailView>("GET", pathname));
  }

  async joinReviewStart(applicationId: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>> {
    const pathname = `/store/join-applications/${encodeURIComponent(applicationId)}/review-start`;
    this.requireAnchoredSession(pathname);
    return await this.realWrite<StoreJoinApplicationDetailView>("POST", pathname, {});
  }

  async joinApprove(applicationId: string, note?: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>> {
    const pathname = `/store/join-applications/${encodeURIComponent(applicationId)}/approve`;
    this.requireAnchoredSession(pathname);
    return await this.realWrite<StoreJoinApplicationDetailView>("POST", pathname, {
      ...(note ? { note } : {}),
    });
  }

  async joinReject(applicationId: string, reason: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>> {
    const pathname = `/store/join-applications/${encodeURIComponent(applicationId)}/reject`;
    this.requireAnchoredSession(pathname);
    return await this.realWrite<StoreJoinApplicationDetailView>("POST", pathname, { reason });
  }

  async joinRevoke(applicationId: string, reason?: string): Promise<StoreApiResult<StoreJoinApplicationDetailView>> {
    const pathname = `/store/join-applications/${encodeURIComponent(applicationId)}/revoke`;
    this.requireAnchoredSession(pathname);
    return await this.realWrite<StoreJoinApplicationDetailView>("POST", pathname, {
      ...(reason ? { reason } : {}),
    });
  }

  private async withRead<TData>(
    pathname: string,
    request: () => Promise<TData>,
  ): Promise<StoreApiResult<TData>> {
    return {
      data: await request(),
      source: { kind: "real", baseUrl: this.requireBaseUrl(pathname) },
    };
  }

  private async realRead<TData = unknown>(
    method: "GET",
    pathname: string,
    transform?: (response: unknown) => TData,
  ): Promise<StoreApiResult<TData>> {
    const response = await this.requestJson<unknown>(method, pathname);
    return {
      data: transform ? transform(response) : (response as TData),
      source: { kind: "real", baseUrl: this.requireBaseUrl(pathname) },
    };
  }

  private async realWrite<TData = unknown>(
    method: "POST" | "PUT",
    pathname: string,
    body?: unknown,
  ): Promise<StoreApiResult<TData>> {
    return {
      data: await this.requestJson<TData>(method, pathname, body),
      source: { kind: "real", baseUrl: this.requireBaseUrl(pathname) },
    };
  }

  private async requestJson<TResponse>(
    method: string,
    pathname: string,
    body?: unknown,
  ): Promise<TResponse> {
    const baseUrl = this.requireBaseUrl(pathname);
    const token = this.#sessionToken?.();
    return await fetchStoreJson<TResponse>(baseUrl, pathname, {
      method,
      body,
      headers: {
        ...this.access.headers,
        ...(token ? { "x-uvp-store-session": token } : {}),
      },
    }, this.#fetchImpl);
  }

  private requireBaseUrl(pathname: string): string {
    if (!this.baseUrl) {
      throw new StoreApiError(
        pathname,
        0,
        "Store API base URL is not configured",
      );
    }
    return this.baseUrl;
  }

  private requireWriteAccess(pathname: string): void {
    if (!this.access.canWrite) {
      throw new StoreApiError(pathname, 403, "forbidden", {
        code: "forbidden",
      });
    }
  }

  private requireAnchoredSession(pathname: string): void {
    if (!this.access.anchoredAddress) {
      throw new StoreApiError(pathname, 403, "forbidden", {
        code: "forbidden",
        details: { required: "anchored_wallet_session" },
      });
    }
  }
}

async function fetchStoreJson<TResponse>(
  baseUrl: string,
  pathname: string,
  init: {
    readonly method: string;
    readonly body?: unknown;
    readonly headers?: Readonly<Record<string, string>>;
  },
  fetchImpl: typeof fetch = fetch.bind(globalThis),
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
    response = await fetchImpl(`${baseUrl}${pathname}`, {
      method: init.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(STORE_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new StoreApiUnavailableError(pathname, "请求超时");
    }
    throw new StoreApiUnavailableError(
      pathname,
      error instanceof Error ? error.message : "network_error",
    );
  }

  if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
    throw new StoreApiError(pathname, response.status, `redirect_refused:${response.status}`, {
      code: "redirect_refused",
    });
  }

  if (!response.ok) {
    const parsed = await readStoreError(response);
    throw new StoreApiError(pathname, response.status, parsed.message, {
      code: parsed.code,
      details: parsed.details,
    });
  }
  try {
    return (await response.json()) as TResponse;
  } catch (error) {
    throw new StoreApiError(
      pathname,
      0,
      error instanceof Error ? error.message : "store_response_not_json",
      { code: "store_response_not_json" },
    );
  }
}

async function readStoreError(
  response: Response,
): Promise<{
  readonly code?: string;
  readonly message: string;
  readonly details?: unknown;
}> {
  try {
    const body = (await response.json()) as {
      readonly error?: string;
      readonly message?: string;
      readonly details?: unknown;
    };
    const code = body.error;
    return {
      ...(code ? { code } : {}),
      message: body.message ?? body.error ?? `${response.status}`,
      ...(body.details !== undefined ? { details: body.details } : {}),
    };
  } catch {
    return { message: `${response.status}` };
  }
}

export function parseStoreDockingSession(
  response: unknown,
  pathname = "/store/docking-sessions",
): StoreDockingSessionDTO {
  const record = isRecord(response) ? response : undefined;
  const session = record && isRecord(record.session) ? record.session : record;
  if (!isRecord(session)) {
    throw new StoreApiError(pathname, 0, "docking_session_response_invalid");
  }
  requiredStoreString(session.sessionId, pathname, "docking_session_response_invalid");
  dockingSessionStatusValue(session.status, pathname);
  requiredStoreAddress(session.createdBy, pathname, "docking_session_response_invalid");
  return session as unknown as StoreDockingSessionDTO;
}

function dockingSessionStatusValue(
  value: unknown,
  pathname: string,
): StoreDockingSessionDTO["status"] {
  if (value === "draft" || value === "valid" || value === "invalid") {
    return value;
  }
  throw new StoreApiError(pathname, 0, "docking_session_response_invalid", {
    code: "docking_session_response_invalid",
  });
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

export function parseStoreRuntimeSummary(response: unknown): StoreRuntimeSummaryDTO {
  const record = requiredStoreRecord(
    response,
    "/store/runtime/summary",
    "store_runtime_summary_response_invalid",
  );
  if (record.sourceOfTruth !== "contracts-and-chain-events") {
    throw new StoreApiError(
      "/store/runtime/summary",
      0,
      "store_runtime_summary_response_invalid",
      { code: "store_runtime_summary_response_invalid" },
    );
  }
  return {
    sourceOfTruth: "contracts-and-chain-events",
    activeZhixuCount: requiredStoreNumber(
      record.activeZhixuCount,
      "/store/runtime/summary",
      "store_runtime_summary_response_invalid",
    ),
    runningOrderCount: requiredStoreNumber(
      record.runningOrderCount,
      "/store/runtime/summary",
      "store_runtime_summary_response_invalid",
    ),
    openTaskCount: requiredStoreNumber(
      record.openTaskCount,
      "/store/runtime/summary",
      "store_runtime_summary_response_invalid",
    ),
    blockedOrderCount: requiredStoreNumber(
      record.blockedOrderCount,
      "/store/runtime/summary",
      "store_runtime_summary_response_invalid",
    ),
    indexerStatus: requiredStoreIndexerStatus(
      record.indexerStatus,
      "/store/runtime/summary",
    ),
    updatedAt: requiredStoreString(
      record.updatedAt,
      "/store/runtime/summary",
      "store_runtime_summary_response_invalid",
    ),
  };
}

function storeSupplierFromResponse(value: unknown, pathname: string): StoreSupplierDTO {
  const record = isRecord(value) ? value : undefined;
  if (!record) {
    throw new StoreApiError(pathname, 0, "store_supplier_response_invalid");
  }
  const supplierId =
    stringValue(record.supplierId) ??
    stringValue(record.supplierSubjectId) ??
    stringValue(record.subjectId);
  if (!supplierId) {
    throw new StoreApiError(pathname, 0, "store_supplier_response_invalid");
  }
  const supplierSubjectId =
    stringValue(record.supplierSubjectId) ??
    stringValue(record.subjectId) ??
    supplierId;
  const wallet = stringValue(record.wallet);
  const identityStatus = supplierIdentityStatusValue(
    record.identityStatus,
    pathname,
  );
  const supportedRoleSlotIds = arrayOfStrings(record.supportedRoleSlotIds);
  const supportedStageIds = arrayOfStrings(record.supportedStageIds);
  const registryAddresses = arrayOfStrings(record.registryAddresses);
  const reviewStatus = supplierReviewStatusValue(
    record.reviewStatus,
    pathname,
  );
  return {
    supplierId,
    supplierSubjectId,
    displayName:
      stringValue(record.displayName) ??
      stringValue(record.identityLabel) ??
      shortValue(supplierId),
    ...(wallet ? { wallet } : {}),
    ...(record.notificationProfile !== undefined
      ? { notificationProfile: record.notificationProfile }
      : {}),
    ...(stringValue(record.notificationProfileHash)
      ? { notificationProfileHash: stringValue(record.notificationProfileHash) }
      : {}),
    ...(stringValue(record.notificationUpdatedAt)
      ? { notificationUpdatedAt: stringValue(record.notificationUpdatedAt) }
      : {}),
    identityStatus,
    identityLabel:
      stringValue(record.identityLabel) ??
      (identityStatus === "revoked"
        ? "身份映射已撤销"
        : identityStatus === "not_found"
          ? "未发现身份映射"
          : "身份映射有效"),
    supportedRoleSlotIds,
    supportedStageIds,
    registryAddresses,
    recentOrderCount: numberValue(record.recentOrderCount) ?? 0,
    openTaskCount: numberValue(record.openTaskCount) ?? 0,
    reviewStatus,
    ...(stringValue(record.metadataURI)
      ? { metadataURI: stringValue(record.metadataURI) }
      : {}),
    proofRows: proofRowsFromResponse(record.proofRows),
    nextAction:
      stringValue(record.nextAction) ??
      "查看 Store 资料与链上身份映射。",
    updatedAt: stringValue(record.updatedAt) ?? "",
  };
}

function supplierMutationResultFromResponse(
  pathname: string,
  response: unknown,
): StoreSupplierMutationResultDTO {
  const record = isRecord(response) ? response : {};
  if (!isRecord(record.supplier)) {
    throw new StoreApiError(pathname, 0, "store_supplier_response_invalid");
  }
  return {
    supplier: storeSupplierFromResponse(record.supplier, pathname),
    ...(record.governance !== undefined
      ? { governance: record.governance }
      : {}),
  };
}

function requiredStoreRecord(
  value: unknown,
  pathname: string,
  code: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new StoreApiError(pathname, 0, code, { code });
  }
  return value;
}

function requiredStoreNumber(
  value: unknown,
  pathname: string,
  code: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StoreApiError(pathname, 0, code, { code });
  }
  return value;
}

function requiredStoreString(value: unknown, pathname: string, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StoreApiError(pathname, 0, code, { code });
  }
  return value;
}

function requiredStoreAddress(value: unknown, pathname: string, code: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    throw new StoreApiError(pathname, 0, code, { code });
  }
  return value;
}

function requiredStoreIndexerStatus(
  value: unknown,
  pathname: string,
): StoreRuntimeSummaryDTO["indexerStatus"] {
  if (value === "ready" || value === "syncing" || value === "rebuilding" || value === "degraded") {
    return value;
  }
  throw new StoreApiError(pathname, 0, "store_runtime_summary_response_invalid", {
    code: "store_runtime_summary_response_invalid",
  });
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

function supplierReviewStatusValue(
  value: unknown,
  pathname: string,
): StoreSupplierDTO["reviewStatus"] {
  switch (value) {
    case "draft":
    case "submitted":
    case "approved_for_broadcast":
    case "rejected":
    case "revoked":
      return value;
    default:
      throw new StoreApiError(
        pathname,
        0,
        "store_supplier_response_invalid",
        { code: "store_supplier_response_invalid" },
      );
  }
}

function supplierIdentityStatusValue(
  value: unknown,
  pathname: string,
): StoreSupplierDTO["identityStatus"] {
  if (value === "active" || value === "revoked" || value === "not_found") {
    return value;
  }
  throw new StoreApiError(pathname, 0, "store_supplier_response_invalid", {
    code: "store_supplier_response_invalid",
  });
}

function accessHeaders(
  level: StoreAccessLevel,
  userId: string | undefined,
): Readonly<Record<string, string>> {
  if (level === "store_admin") {
    const adminId = userId ?? "store-admin";
    return {
      "x-uvp-store-user-id": adminId,
      "x-uvp-store-role": "admin",
      "x-uvp-store-operator-id": adminId,
      "x-uvp-store-operator-role": "admin",
      "x-uvp-admin-id": adminId,
      "x-uvp-admin-role": "admin",
    };
  }
  if (level === "store_operator") {
    const operatorId = userId ?? "store-operator";
    return {
      "x-uvp-store-user-id": operatorId,
      "x-uvp-store-role": "operator",
      "x-uvp-store-operator-id": operatorId,
      "x-uvp-store-operator-role": "operator",
    };
  }
  if (level === "store_read") {
    return {
      "x-uvp-store-user-id": userId ?? "store-reader",
      "x-uvp-store-role": "read",
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

function canWriteForLevel(level: StoreAccessLevel): boolean {
  return level === "store_operator" || level === "store_admin";
}

function sessionFromResponse(
  response: unknown,
  fallback: StoreAccessState,
): StoreSessionDTO {
  const record = isRecord(response) ? response : {};
  const session: Record<string, unknown> = isRecord(record.session)
    ? record.session
    : {};
  const accessLevel =
    normalizeStoreAccessLevel(stringValue(session.accessLevel)) ??
    fallback.level;
  const principalId = stringValue(session.principalId);
  const roles = arrayOfStrings(session.roles).filter(isStoreRole);
  const authMode =
    authModeValue(stringValue(session.authMode)) ?? fallback.authMode;
  const anchoredAddress = stringValue(session.anchoredAddress);
  const anchorSource = stringValue(session.anchorSource);
  const accountId = stringValue(session.accountId);
  const accountAddresses = Array.isArray(session.accountAddresses)
    ? (session.accountAddresses as readonly StoreAccountAddressView[])
    : undefined;
  return {
    authenticated: session.authenticated === true,
    ...(principalId ? { principalId } : {}),
    accessLevel,
    roles,
    authMode,
    canWrite: session.canWrite === true,
    canAdmin: session.canAdmin === true,
    ...(anchoredAddress ? { anchoredAddress } : {}),
    ...(anchorSource ? { anchorSource: anchorSource as StoreSessionDTO["anchorSource"] } : {}),
    ...(accountId ? { accountId } : {}),
    ...(accountAddresses ? { accountAddresses } : {}),
  };
}

function arrayOfStrings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function authModeValue(value: string | undefined): StoreAuthMode | undefined {
  switch (value) {
    case "anonymous":
    case "wallet_session":
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
  return (
    value === "anonymous_read" ||
    value === "store_read" ||
    value === "store_reader" ||
    value === "store_operator" ||
    value === "store_admin" ||
    value === "governance_admin"
  );
}

function normalizeStoreAccessLevel(
  value: string | undefined,
): StoreAccessLevel | undefined {
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
  if (
    normalized === "read" ||
    normalized === "reader" ||
    normalized === "store_read"
  ) {
    return "store_read";
  }
  if (normalized === "anonymous" || normalized === "anonymous_read") {
    return "anonymous_read";
  }
  return undefined;
}

function resolveStoreApiBaseUrl(): string | undefined {
  return resolveFrontendApiBaseUrl((import.meta.env ?? {})?.VITE_UVP_CHAIN_SERVICES_URL);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
