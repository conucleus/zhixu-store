import {
  type ChainProofRowDTO,
  type ProductParticipantProfileDTO,
  type ParticipantDTO,
  type ProductOrderDTO,
  type ProductTaskDTO,
  type ZhixuDetailDTO,
  type ZhixuSummaryDTO
} from "@uvp-eth/product-dto";
import {
  CROSS_BORDER_ZHIXU_ID,
  DEMO_ORDER_ID,
  DEMO_TASK_ID,
  crossBorderPlanIds,
  demoOrder,
  demoPaymentTask,
  demoTask,
  demoZhixuDetail
} from "@uvp-eth/product-dto/fixtures";
import {
  isExplicitFrontendDemoMode,
  isRecord,
  normalizeBaseUrl,
  resolveFrontendApiBaseUrl,
  readQueryValue,
  shortHash
} from "../shared/frontend";

export { shortHash } from "../shared/frontend";

export type ProductApiSource =
  | {
      readonly kind: "real";
      readonly baseUrl: string;
    }
  | {
      readonly kind: "mock";
      readonly reason: string;
      readonly baseUrl?: string;
      readonly attemptedPath?: string;
    };

export interface ProductApiResult<TData> {
  readonly data: TData;
  readonly source: ProductApiSource;
}

export interface ProductWorkbenchData {
  readonly participant: ProductParticipantProfileDTO;
  readonly zhixus: readonly ZhixuDetailDTO[];
  readonly orders: readonly ProductOrderDTO[];
  readonly tasks: readonly ProductTaskDTO[];
  readonly zhixu?: ZhixuDetailDTO;
  readonly order?: ProductOrderDTO;
  readonly activeTask?: ProductTaskDTO;
  readonly source: ProductApiSource;
  readonly syncState: ProductSyncState;
}

export type ProductSyncState = "ready" | "syncing" | "fallback";

export interface WorkbenchEndpointDiagnostic {
  readonly endpoint: string;
  readonly status: number;
  readonly errorCode?: string;
  readonly message: string;
}

export class WorkbenchLoadError extends Error {
  override readonly name = "WorkbenchLoadError";
  readonly diagnostics: readonly WorkbenchEndpointDiagnostic[];
  readonly source: ProductApiSource;

  constructor(diagnostics: readonly WorkbenchEndpointDiagnostic[], source: ProductApiSource) {
    super("订单工作台加载失败");
    this.diagnostics = diagnostics;
    this.source = source;
  }
}

export type ProductOrderDraftStatus =
  | "draft"
  | "awaiting_participants"
  | "ready_to_trigger"
  | "triggering"
  | "triggered"
  | "failed"
  | "cancelled";

export type DraftParticipantStatus = "missing" | "invited" | "accepted" | "rejected" | "replaced";

export interface ProductOrderDraftDTO {
  readonly draftId: string;
  readonly zhixuId: string;
  readonly planId: string;
  readonly planHash: string;
  readonly title: string;
  readonly businessType: string;
  readonly goods?: readonly string[];
  readonly totalAmount: string;
  readonly currency: string;
  readonly exportRegion?: string;
  readonly destinationRegion?: string;
  readonly expectedCompletionDate?: string;
  readonly notes?: string;
  readonly status: ProductOrderDraftStatus;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly triggeredOrderId?: string;
  readonly triggerTxHash?: string;
}

export interface DraftParticipantDTO {
  readonly participantId: string;
  readonly draftId: string;
  readonly roleSlotId: string;
  readonly roleLabel: string;
  readonly displayName: string;
  readonly walletAddress?: string;
  readonly contact: string;
  readonly status: DraftParticipantStatus;
  readonly required: boolean;
  readonly acceptedAt?: string;
  readonly rejectedAt?: string;
}

export type ProductInviteStatus = "active" | "accepted" | "rejected" | "expired" | "revoked";

export interface ProductInviteDTO {
  readonly inviteId: string;
  readonly draftId: string;
  readonly participantId: string;
  readonly roleSlotId: string;
  readonly tokenHash: string;
  readonly status: ProductInviteStatus;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly acceptedWalletAddress?: string;
  readonly inviteUrl?: string;
}

export interface CreateOrderDraftInput {
  readonly zhixuId: string;
  readonly title: string;
  readonly businessType: string;
  readonly totalAmount: string;
  readonly currency: string;
}

export type UpdateOrderDraftInput = Partial<
  Pick<
    ProductOrderDraftDTO,
    | "title"
    | "businessType"
    | "goods"
    | "totalAmount"
    | "currency"
    | "exportRegion"
    | "destinationRegion"
    | "expectedCompletionDate"
    | "notes"
  >
>;

export interface CreateInviteInput {
  readonly participantId: string;
  readonly roleSlotId: string;
  readonly roleLabel: string;
  readonly contact: string;
  readonly displayName?: string;
  readonly required?: boolean;
}

export type EvidenceStatus = "uploaded" | "bound" | "revoked" | "quarantined";

export interface EvidenceObjectDTO {
  readonly evidenceId: string;
  readonly orderId?: string;
  readonly draftId?: string;
  readonly taskId?: string;
  readonly stageIdentifier: string;
  readonly ownerParticipantId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly storageURI: string;
  readonly contentHash: string;
  readonly metadataHash: string;
  readonly payloadHash: string;
  readonly payloadRef: string;
  readonly status: EvidenceStatus;
  readonly createdAt: string;
  readonly boundSignalTxHash?: string;
}

export interface EvidenceMetadataDTO {
  readonly evidenceId?: string;
  readonly businessLabel: string;
  readonly description?: string;
  readonly documentType: string;
  readonly issuer?: string;
  readonly issuedAt?: string;
  readonly fields?: Readonly<Record<string, string>>;
  readonly redactionPolicy?: string;
}

export interface EvidenceProofDTO {
  readonly payloadHash: string;
  readonly contentHash: string;
  readonly metadataHash: string;
  readonly boundSignalTxHash?: string;
  readonly blockNumber?: string;
  readonly submitter?: string;
  readonly verificationStatus: "unbound" | "matched" | "mismatch" | "missing_file";
}

export interface UploadEvidenceInput {
  readonly file: File;
  readonly orderId?: string;
  readonly draftId?: string;
  readonly taskId?: string;
  readonly stageIdentifier: string;
  readonly documentType: string;
  readonly metadata: EvidenceMetadataDTO;
}

export interface PrepareSubmitInput {
  readonly evidenceIds: readonly string[];
  readonly walletAddress: string;
  readonly intent: "confirm_stage" | "reject_stage" | "raise_dispute" | "resolve_dispute";
}

export interface PreparedSubmitDTO {
  readonly prepareId: string;
  readonly taskId: string;
  readonly expiresAt: string;
  readonly summary: {
    readonly orderTitle: string;
    readonly stageName: string;
    readonly actionLabel: string;
    readonly evidenceFingerprint: string;
    readonly walletAddress: string;
    readonly authorizationValidUntil: string;
  };
  readonly typedData: unknown;
}

export type ProductSubmissionStatus =
  | "prepared"
  | "signature_received"
  | "broadcasting"
  | "submitted"
  | "indexing"
  | "confirmed"
  | "failed"
  | "expired"
  | "replaced";

export interface ProductSubmissionDTO {
  readonly submissionId: string;
  readonly taskId: string;
  readonly status: ProductSubmissionStatus;
  readonly statusLabel: string;
  readonly txHash?: string;
  readonly blockNumber?: string;
  readonly errorCode?: string;
  readonly retryable: boolean;
  readonly proofRows: readonly ChainProofRowDTO[];
}

export interface SubmitTaskInput {
  readonly prepareId: string;
  readonly signature: string;
  readonly walletAddress: string;
}

export interface PreparedOrderTriggerDTO {
  readonly prepareId: string;
  readonly triggerId: string;
  readonly draftId: string;
  readonly orderId: string;
  readonly expiresAt: string;
  readonly submitter: string;
  readonly typedData: unknown;
  readonly summary?: Readonly<Record<string, unknown>>;
}

export interface TriggerOrderInput {
  readonly prepareId: string;
  readonly signature: string;
  readonly walletAddress: string;
}

export interface ProductApiClient {
  readonly baseUrl?: string;
  loadWorkbenchData(): Promise<ProductWorkbenchData>;
  createOrderDraft(input: CreateOrderDraftInput): Promise<ProductApiResult<ProductOrderDraftDTO>>;
  updateOrderDraft(draftId: string, input: UpdateOrderDraftInput): Promise<ProductApiResult<ProductOrderDraftDTO>>;
  getOrderDraft(draftId: string): Promise<ProductApiResult<ProductOrderDraftDTO>>;
  createInvite(draftId: string, input: CreateInviteInput): Promise<ProductApiResult<ProductInviteDTO>>;
  acceptInvite(inviteId: string, input: { readonly displayName: string; readonly walletAddress: string; readonly contact: string }): Promise<ProductApiResult<ProductInviteDTO>>;
  rejectInvite(inviteId: string): Promise<ProductApiResult<ProductInviteDTO>>;
  listParticipants(draftId: string): Promise<ProductApiResult<readonly DraftParticipantDTO[]>>;
  prepareOrderTrigger(draftId: string, input: { readonly walletAddress: string }): Promise<ProductApiResult<PreparedOrderTriggerDTO>>;
  triggerOrder(draftId: string, input: TriggerOrderInput): Promise<ProductApiResult<ProductOrderDraftDTO>>;
  uploadEvidence(input: UploadEvidenceInput): Promise<ProductApiResult<EvidenceObjectDTO>>;
  getEvidence(evidenceId: string): Promise<ProductApiResult<EvidenceObjectDTO>>;
  getEvidenceProof(evidenceId: string): Promise<ProductApiResult<EvidenceProofDTO>>;
  prepareTaskSubmit(taskId: string, input: PrepareSubmitInput): Promise<ProductApiResult<PreparedSubmitDTO>>;
  submitTask(taskId: string, input: SubmitTaskInput): Promise<ProductApiResult<ProductSubmissionDTO>>;
  getSubmission(submissionId: string): Promise<ProductApiResult<ProductSubmissionDTO>>;
}

const fallbackSource: ProductApiSource = {
  kind: "mock",
  reason: "开发样例模式已显式开启，使用本地样例数据"
};

const PRODUCT_DEMO_MODE_STORAGE_KEY = "uvp.product.demoMode";

const mockDrafts = new Map<string, ProductOrderDraftDTO>();
const mockParticipants = new Map<string, readonly DraftParticipantDTO[]>();
const mockInvites = new Map<string, ProductInviteDTO>();
const mockEvidence = new Map<string, EvidenceObjectDTO>();
const mockSubmissions = new Map<string, ProductSubmissionDTO & { readonly pollCount: number }>();

let draftSequence = 1;
let inviteSequence = 1;
let evidenceSequence = 1;
let submissionSequence = 1;

export function createProductApiClient(): ProductApiClient {
  const envBaseUrl = resolveFrontendApiBaseUrl(import.meta.env, ["VITE_PRODUCT_API_BASE_URL"]);
  const e2eBaseUrl = isProductE2EEnabled() ? readE2EApiBaseUrl() : undefined;
  const baseUrl = normalizeBaseUrl(e2eBaseUrl ?? envBaseUrl);
  return new BrowserProductApiClient(baseUrl, { demoMode: isExplicitProductDemoMode() });
}

export async function loadProductWorkbenchData(): Promise<ProductWorkbenchData> {
  return await createProductApiClient().loadWorkbenchData();
}

class BrowserProductApiClient implements ProductApiClient {
  readonly baseUrl?: string;
  readonly demoMode: boolean;

  constructor(baseUrl: string | undefined, options: { readonly demoMode: boolean }) {
    this.baseUrl = baseUrl;
    this.demoMode = options.demoMode;
  }

  async loadWorkbenchData(): Promise<ProductWorkbenchData> {
    if (!this.baseUrl) {
      if (this.demoMode) {
        return mockWorkbenchData(fallbackSource);
      }
      throw new ApiMissingConfigError("/product/zhixus", "API base URL is not configured");
    }

    try {
      const zhixusResponse = await fetchJsonWithTimeout<{ readonly zhixus: readonly ZhixuSummaryDTO[] }>(
        this.baseUrl,
        "/product/zhixus",
        UVP_WORKBENCH_FETCH_TIMEOUT_MS
      );
      const visibleSummaries = zhixusResponse.zhixus.filter((zhixu) =>
        zhixu.reviewStatus === "approved" || (isProductE2EEnabled() && zhixu.reviewStatus === "revoked")
      );
      const zhixus = (await Promise.all(
        visibleSummaries.map(async (summary) => {
          try {
            return await this.fetchZhixuDetail(summary.zhixuId);
          } catch {
            return undefined;
          }
        })
      )).filter(isDefined);
      const criticalEndpoints = [
        { path: "/product/orders", label: "orders" },
        { path: "/product/tasks", label: "tasks" }
      ] as const;
      const [ordersSettled, tasksSettled, meSettled] = await Promise.allSettled([
        fetchJsonWithTimeout<{ readonly orders: readonly ProductOrderDTO[] }>(this.baseUrl, "/product/orders", UVP_WORKBENCH_FETCH_TIMEOUT_MS),
        fetchJsonWithTimeout<{ readonly tasks: readonly ProductTaskDTO[] }>(this.baseUrl, "/product/tasks", UVP_WORKBENCH_FETCH_TIMEOUT_MS),
        fetchJsonWithTimeout<{
          readonly participant: ProductParticipantProfileDTO;
          readonly summary?: unknown;
        }>(this.baseUrl, "/product/me", UVP_WORKBENCH_FETCH_TIMEOUT_MS)
      ]);

      const diagnostics = collectEndpointDiagnostics([
        { path: "/product/orders", result: ordersSettled },
        { path: "/product/tasks", result: tasksSettled },
        { path: "/product/me", result: meSettled }
      ]);

      if (diagnostics.length > 0) {
        const criticalFailed = diagnostics.some((diag) =>
          criticalEndpoints.some((endpoint) => endpoint.path === diag.endpoint)
        );
        if (criticalFailed) {
          throw new WorkbenchLoadError(diagnostics, { kind: "real", baseUrl: this.baseUrl });
        }
      }

      const ordersResponse = settledValue(ordersSettled, "/product/orders");
      const tasksResponse = settledValue(tasksSettled, "/product/tasks");
      const meResponse = meSettled.status === "fulfilled" ? meSettled.value : undefined;
      if (!ordersResponse || !tasksResponse) {
        throw new WorkbenchLoadError(diagnostics, { kind: "real", baseUrl: this.baseUrl });
      }
      const orders = sortLatestProjectionFirst(ordersResponse.orders);
      const tasks = sortLatestProjectionFirst(tasksResponse.tasks);
      const order = orders.find((item) => item.status === "active") ?? orders.find((item) => item.orderId === DEMO_ORDER_ID) ?? orders[0];
      const activeTask = tasks.find((task) => task.orderId === order?.orderId && task.status === "open") ??
        tasks.find((task) => task.status === "open") ??
        tasks.find((task) => task.taskId === DEMO_TASK_ID) ??
        tasks[0];
      return {
        participant: meResponse?.participant ?? participantFromTasks(tasks),
        zhixus,
        orders,
        tasks,
        zhixu: zhixus[0],
        order,
        activeTask,
        source: { kind: "real", baseUrl: this.baseUrl },
        syncState: isSyncing(order, activeTask) ? "syncing" : "ready"
      };
    } catch (error) {
      throw error;
    }
  }

  async createOrderDraft(input: CreateOrderDraftInput): Promise<ProductApiResult<ProductOrderDraftDTO>> {
    return await this.withRequestOrDemo(
      "POST",
      "/product/order-drafts",
      async () => await this.requestJson<{ readonly draft: ProductOrderDraftDTO }>("POST", "/product/order-drafts", input)
        .then((response) => response.draft),
      () => mockCreateOrderDraft(input)
    );
  }

  async updateOrderDraft(draftId: string, input: UpdateOrderDraftInput): Promise<ProductApiResult<ProductOrderDraftDTO>> {
    return await this.withRequestOrDemo(
      "PATCH",
      `/product/order-drafts/${encodeURIComponent(draftId)}`,
      async () => await this.requestJson<{ readonly draft: ProductOrderDraftDTO }>(
        "PATCH",
        `/product/order-drafts/${encodeURIComponent(draftId)}`,
        input
      ).then((response) => response.draft),
      () => mockUpdateOrderDraft(draftId, input)
    );
  }

  async getOrderDraft(draftId: string): Promise<ProductApiResult<ProductOrderDraftDTO>> {
    return await this.withRequestOrDemo(
      "GET",
      `/product/order-drafts/${encodeURIComponent(draftId)}`,
      async () => await this.requestJson<{ readonly draft: ProductOrderDraftDTO }>(
        "GET",
        `/product/order-drafts/${encodeURIComponent(draftId)}`
      ).then((response) => response.draft),
      () => mockGetOrderDraft(draftId)
    );
  }

  async createInvite(draftId: string, input: CreateInviteInput): Promise<ProductApiResult<ProductInviteDTO>> {
    return await this.withRequestOrDemo(
      "POST",
      `/product/orders/${encodeURIComponent(draftId)}/invites`,
      async () => await this.requestJson<{ readonly invite: ProductInviteDTO }>(
        "POST",
        `/product/orders/${encodeURIComponent(draftId)}/invites`,
        input
      ).then((response) => response.invite),
      () => mockCreateInvite(draftId, input)
    );
  }

  async acceptInvite(
    inviteId: string,
    input: { readonly displayName: string; readonly walletAddress: string; readonly contact: string }
  ): Promise<ProductApiResult<ProductInviteDTO>> {
    return await this.withRequestOrDemo(
      "POST",
      `/product/invites/${encodeURIComponent(inviteId)}/accept`,
      async () => await this.requestJson<{ readonly invite: ProductInviteDTO }>(
        "POST",
        `/product/invites/${encodeURIComponent(inviteId)}/accept`,
        input
      ).then((response) => response.invite),
      () => mockAcceptInvite(inviteId, input)
    );
  }

  async rejectInvite(inviteId: string): Promise<ProductApiResult<ProductInviteDTO>> {
    return await this.withRequestOrDemo(
      "POST",
      `/product/invites/${encodeURIComponent(inviteId)}/reject`,
      async () => await this.requestJson<{ readonly invite: ProductInviteDTO }>(
        "POST",
        `/product/invites/${encodeURIComponent(inviteId)}/reject`
      ).then((response) => response.invite),
      () => mockRejectInvite(inviteId)
    );
  }

  async listParticipants(draftId: string): Promise<ProductApiResult<readonly DraftParticipantDTO[]>> {
    return await this.withRequestOrDemo(
      "GET",
      `/product/orders/${encodeURIComponent(draftId)}/participants`,
      async () => await this.requestJson<{ readonly participants: readonly DraftParticipantDTO[] }>(
        "GET",
        `/product/orders/${encodeURIComponent(draftId)}/participants`
      ).then((response) => response.participants),
      () => mockListParticipants(draftId)
    );
  }

  async prepareOrderTrigger(
    draftId: string,
    input: { readonly walletAddress: string }
  ): Promise<ProductApiResult<PreparedOrderTriggerDTO>> {
    return await this.withRequestOrDemo(
      "POST",
      `/product/order-drafts/${encodeURIComponent(draftId)}/prepare-trigger`,
      async () => await this.requestJson<{ readonly prepared: PreparedOrderTriggerDTO }>(
        "POST",
        `/product/order-drafts/${encodeURIComponent(draftId)}/prepare-trigger`,
        input
      ).then((response) => response.prepared),
      () => mockPrepareOrderTrigger(draftId, input)
    );
  }

  async triggerOrder(draftId: string, input: TriggerOrderInput): Promise<ProductApiResult<ProductOrderDraftDTO>> {
    return await this.withRequestOrDemo(
      "POST",
      `/product/order-drafts/${encodeURIComponent(draftId)}/trigger`,
      async () => await this.requestJson<{ readonly draft: ProductOrderDraftDTO }>(
        "POST",
        `/product/order-drafts/${encodeURIComponent(draftId)}/trigger`,
        input
      ).then((response) => response.draft),
      () => mockTriggerOrder(draftId, input)
    );
  }

  async uploadEvidence(input: UploadEvidenceInput): Promise<ProductApiResult<EvidenceObjectDTO>> {
    const path = "/product/evidence";
    return await this.withRequestOrDemo(
      "POST",
      path,
      async () => {
        const response = await this.requestJson<unknown>("POST", path, await evidenceUploadBody(input));
        return evidenceFromResponse(response);
      },
      () => mockUploadEvidence(input)
    );
  }

  async getEvidence(evidenceId: string): Promise<ProductApiResult<EvidenceObjectDTO>> {
    return await this.withRequestOrDemo(
      "GET",
      `/product/evidence/${encodeURIComponent(evidenceId)}`,
      async () => await this.requestJson<{ readonly evidence: EvidenceObjectDTO }>(
        "GET",
        `/product/evidence/${encodeURIComponent(evidenceId)}`
      ).then((response) => response.evidence),
      () => mockGetEvidence(evidenceId)
    );
  }

  async getEvidenceProof(evidenceId: string): Promise<ProductApiResult<EvidenceProofDTO>> {
    return await this.withRequestOrDemo(
      "GET",
      `/product/evidence/${encodeURIComponent(evidenceId)}/proof`,
      async () => await this.requestJson<{ readonly proof: EvidenceProofDTO }>(
        "GET",
        `/product/evidence/${encodeURIComponent(evidenceId)}/proof`
      ).then((response) => response.proof),
      () => mockGetEvidenceProof(evidenceId)
    );
  }

  async prepareTaskSubmit(taskId: string, input: PrepareSubmitInput): Promise<ProductApiResult<PreparedSubmitDTO>> {
    return await this.withRequestOrDemo(
      "POST",
      `/product/tasks/${encodeURIComponent(taskId)}/prepare-submit`,
      async () => await this.requestJson<unknown>(
        "POST",
        `/product/tasks/${encodeURIComponent(taskId)}/prepare-submit`,
        input
      ).then(preparedSubmitFromResponse),
      () => mockPrepareTaskSubmit(taskId, input)
    );
  }

  async submitTask(taskId: string, input: SubmitTaskInput): Promise<ProductApiResult<ProductSubmissionDTO>> {
    return await this.withRequestOrDemo(
      "POST",
      `/product/tasks/${encodeURIComponent(taskId)}/submit`,
      async () => await this.requestJson<unknown>(
        "POST",
        `/product/tasks/${encodeURIComponent(taskId)}/submit`,
        input
      ).then(submissionFromResponse),
      () => mockSubmitTask(taskId, input)
    );
  }

  async getSubmission(submissionId: string): Promise<ProductApiResult<ProductSubmissionDTO>> {
    return await this.withRequestOrDemo(
      "GET",
      `/product/submissions/${encodeURIComponent(submissionId)}`,
      async () => await this.requestJson<unknown>(
        "GET",
        `/product/submissions/${encodeURIComponent(submissionId)}`
      ).then(submissionFromResponse),
      () => mockGetSubmission(submissionId)
    );
  }

  private async fetchZhixuDetail(zhixuId: string): Promise<ZhixuDetailDTO> {
    if (!this.baseUrl) {
      throw new ApiMissingConfigError(`/product/zhixus/${encodeURIComponent(zhixuId)}`, "API base URL is not configured");
    }
    const response = await fetchJson<{ readonly zhixu: ZhixuDetailDTO }>(
      this.baseUrl,
      `/product/zhixus/${encodeURIComponent(zhixuId)}`
    );
    return response.zhixu;
  }

  private async requestJson<TResponse>(method: string, pathname: string, body?: unknown): Promise<TResponse> {
    if (!this.baseUrl) {
      throw new ApiMissingConfigError(pathname, "API base URL is not configured");
    }
    return await fetchJson<TResponse>(this.baseUrl, pathname, { method, body });
  }

  private async withRequestOrDemo<TData>(
    _method: string,
    pathname: string,
    request: () => Promise<TData>,
    fallback: () => TData
  ): Promise<ProductApiResult<TData>> {
    if (!this.baseUrl) {
      if (!this.demoMode) {
        throw new ApiMissingConfigError(pathname, "API base URL is not configured");
      }
      return { data: fallback(), source: fallbackSource };
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
}

async function evidenceUploadBody(input: UploadEvidenceInput): Promise<Record<string, unknown>> {
  return {
    ...(input.orderId ? { orderId: input.orderId } : {}),
    ...(input.draftId ? { draftId: input.draftId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    stageIdentifier: input.stageIdentifier,
    documentType: input.documentType,
    fileName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    base64Payload: await fileToBase64(input.file),
    metadata: input.metadata
  };
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function evidenceFromResponse(response: unknown): EvidenceObjectDTO {
  const record = requiredRecord(response, "evidence_response_invalid");
  const evidence = requiredRecord(record.evidence, "evidence_response_invalid");
  if (!isRecord(evidence)) {
    throw new Error("evidence_response_invalid");
  }
  return evidence as unknown as EvidenceObjectDTO;
}

function preparedSubmitFromResponse(response: unknown): PreparedSubmitDTO {
  const prepared = requiredRecord(response, "prepared_submit_response_invalid");
  const humanSummary = requiredRecord(prepared.humanSummary, "prepared_submit_response_invalid");
  return {
    ...prepared,
    prepareId: requiredString(prepared.prepareId, "prepared_submit_response_invalid"),
    taskId: requiredString(prepared.taskId, "prepared_submit_response_invalid"),
    expiresAt: requiredString(prepared.expiresAt, "prepared_submit_response_invalid"),
    summary: {
      orderTitle: requiredString(humanSummary.orderId, "prepared_submit_response_invalid"),
      stageName: requiredString(humanSummary.stage, "prepared_submit_response_invalid"),
      actionLabel: requiredString(humanSummary.action, "prepared_submit_response_invalid"),
      evidenceFingerprint: requiredString(humanSummary.payloadHash, "prepared_submit_response_invalid"),
      walletAddress: requiredString(humanSummary.submitter, "prepared_submit_response_invalid"),
      authorizationValidUntil: requiredString(humanSummary.validUntil, "prepared_submit_response_invalid")
    },
    typedData: requiredValue(prepared.typedData, "prepared_submit_response_invalid")
  } as unknown as PreparedSubmitDTO;
}

function submissionFromResponse(response: unknown): ProductSubmissionDTO {
  const submission = requiredRecord(response, "submission_response_invalid");
  const status = requiredSubmissionStatus(submission.status);
  return {
    ...submission,
    submissionId: requiredString(submission.submissionId, "submission_response_invalid"),
    taskId: requiredString(submission.taskId, "submission_response_invalid"),
    status,
    statusLabel: requiredString(submission.statusLabel, "submission_response_invalid"),
    retryable: requiredBoolean(submission.retryable, "submission_response_invalid"),
    proofRows: requiredArray(submission.proofRows, "submission_response_invalid") as readonly ChainProofRowDTO[]
  } as unknown as ProductSubmissionDTO;
}

function requiredRecord(value: unknown, code: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(code);
  }
  return value;
}

function requiredValue<TValue>(value: TValue | undefined, code: string): TValue {
  if (value === undefined) {
    throw new Error(code);
  }
  return value;
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(code);
  }
  return value;
}

function requiredBoolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(code);
  }
  return value;
}

function requiredArray(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(code);
  }
  return value;
}

function requiredSubmissionStatus(value: unknown): ProductSubmissionStatus {
  if (
    value === "prepared" ||
    value === "signature_received" ||
    value === "broadcasting" ||
    value === "submitted" ||
    value === "indexing" ||
    value === "confirmed" ||
    value === "failed" ||
    value === "expired" ||
    value === "replaced"
  ) {
    return value;
  }
  throw new Error("submission_response_invalid");
}

export function productSubmissionStatusLabel(status: ProductSubmissionStatus): string {
  switch (status) {
    case "prepared":
      return "已准备";
    case "signature_received":
      return "签名已接收";
    case "broadcasting":
      return "广播中";
    case "submitted":
      return "已提交";
    case "indexing":
      return "同步中";
    case "confirmed":
      return "已确认";
    case "failed":
      return "提交失败";
    case "expired":
      return "已过期";
    case "replaced":
      return "已替换";
  }
}

class ApiMissingConfigError extends Error {
  readonly pathname: string;

  constructor(pathname: string, message: string) {
    super(message);
    this.name = "ApiMissingConfigError";
    this.pathname = pathname;
  }
}

class ApiNetworkError extends Error {
  readonly pathname: string;
  readonly status?: number;

  constructor(pathname: string, message: string, status?: number) {
    super(message);
    this.name = "ApiNetworkError";
    this.pathname = pathname;
    this.status = status;
  }
}

class ApiRequestError extends Error {
  readonly pathname: string;
  readonly status: number;

  constructor(pathname: string, status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.pathname = pathname;
    this.status = status;
  }
}

class ApiUnsupportedEndpointError extends ApiRequestError {
  constructor(pathname: string, status: number, message: string) {
    super(pathname, status, message);
    this.name = "ApiUnsupportedEndpointError";
  }
}

function mockWorkbenchData(source: ProductApiSource): ProductWorkbenchData {
  return {
    participant: {
      participantId: "wallet:demo",
      displayName: "XX 报关行操作员",
      roleLabels: ["报关行", "资金方"],
      source: "mock"
    },
    zhixus: [demoZhixuDetail],
    orders: [demoOrder],
    tasks: [demoPaymentTask, demoTask],
    zhixu: demoZhixuDetail,
    order: demoOrder,
    activeTask: demoTask,
    source,
    syncState: source.kind === "mock" ? "fallback" : "ready"
  };
}

function participantFromTasks(tasks: readonly ProductTaskDTO[]): ProductParticipantProfileDTO {
  const taskWithWallet = tasks.find((task) => task.assigneeWallet);
  const roleLabels = Array.from(new Set(tasks.map((task) => task.participantRoleLabel ?? task.assigneeRole))).filter((role) => role.length > 0);
  return {
    participantId: taskWithWallet?.assigneeWallet ? `wallet:${taskWithWallet.assigneeWallet.toLowerCase()}` : "anonymous",
    displayName: taskWithWallet?.assigneeWallet ? `钱包 ${shortHash(taskWithWallet.assigneeWallet)}` : "未连接钱包",
    ...(taskWithWallet?.assigneeWallet ? { walletAddress: taskWithWallet.assigneeWallet } : {}),
    roleLabels,
    source: taskWithWallet?.assigneeWallet ? "wallet" : "anonymous"
  };
}

function mockCreateOrderDraft(input: CreateOrderDraftInput): ProductOrderDraftDTO {
  const now = new Date().toISOString();
  const draftId = `draft-${draftSequence.toString().padStart(3, "0")}`;
  draftSequence += 1;
  const draft: ProductOrderDraftDTO = {
    draftId,
    zhixuId: input.zhixuId,
    planId: crossBorderPlanIds.planId,
    planHash: crossBorderPlanIds.planHash,
    title: input.title,
    businessType: input.businessType,
    goods: [input.businessType],
    totalAmount: input.totalAmount,
    currency: input.currency,
    exportRegion: "日本",
    destinationRegion: "阿联酋",
    expectedCompletionDate: "2026-07-31",
    notes: "开发样例草稿，真实 API 接通后由服务端保存。",
    status: "awaiting_participants",
    createdBy: "current-user",
    createdAt: now,
    updatedAt: now
  };
  mockDrafts.set(draftId, draft);
  mockParticipants.set(draftId, participantsFromZhixu(draftId));
  return draft;
}

function mockUpdateOrderDraft(draftId: string, input: UpdateOrderDraftInput): ProductOrderDraftDTO {
  const draft = mockDrafts.get(draftId) ?? mockCreateOrderDraft({
    zhixuId: CROSS_BORDER_ZHIXU_ID,
    title: "A 公司采购 10 台车辆",
    businessType: "车辆",
    totalAmount: "10000",
    currency: "USDC"
  });
  const updated: ProductOrderDraftDTO = {
    ...draft,
    ...input,
    updatedAt: new Date().toISOString()
  };
  mockDrafts.set(updated.draftId, updated);
  return updated;
}

function mockGetOrderDraft(draftId: string): ProductOrderDraftDTO {
  const draft = mockDrafts.get(draftId);
  if (!draft) {
    throw new ApiRequestError(`/product/order-drafts/${draftId}`, 404, "draft_not_found");
  }
  return draft;
}

function mockCreateInvite(draftId: string, input: CreateInviteInput): ProductInviteDTO {
  ensureDraft(draftId);
  const now = new Date();
  const inviteId = `invite-${inviteSequence.toString().padStart(3, "0")}`;
  inviteSequence += 1;
  const invite: ProductInviteDTO = {
    inviteId,
    draftId,
    participantId: input.participantId,
    roleSlotId: input.roleSlotId,
    tokenHash: pseudoHash(`${draftId}:${input.participantId}:${now.toISOString()}`),
    status: "active",
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString(),
    inviteUrl: `${window.location.origin}${window.location.pathname}?invite=${inviteId}`
  };
  mockInvites.set(inviteId, invite);
  mockParticipants.set(
    draftId,
    mockListParticipants(draftId).map((participant) =>
      participant.participantId === input.participantId
        ? {
            ...participant,
            displayName: input.displayName ?? input.roleLabel,
            contact: input.contact,
            status: "invited"
          }
        : participant
    )
  );
  return invite;
}

function mockAcceptInvite(
  inviteId: string,
  input: { readonly displayName: string; readonly walletAddress: string; readonly contact: string }
): ProductInviteDTO {
  const invite = ensureInvite(inviteId);
  const accepted: ProductInviteDTO = {
    ...invite,
    status: "accepted",
    acceptedWalletAddress: input.walletAddress
  };
  mockInvites.set(inviteId, accepted);
  mockParticipants.set(
    invite.draftId,
    mockListParticipants(invite.draftId).map((participant) =>
      participant.participantId === invite.participantId
        ? {
            ...participant,
            displayName: input.displayName,
            walletAddress: input.walletAddress,
            contact: input.contact,
            status: "accepted",
            acceptedAt: new Date().toISOString()
          }
        : participant
    )
  );
  return accepted;
}

function mockRejectInvite(inviteId: string): ProductInviteDTO {
  const invite = ensureInvite(inviteId);
  const rejected: ProductInviteDTO = {
    ...invite,
    status: "rejected"
  };
  mockInvites.set(inviteId, rejected);
  mockParticipants.set(
    invite.draftId,
    mockListParticipants(invite.draftId).map((participant) =>
      participant.participantId === invite.participantId
        ? {
            ...participant,
            status: "rejected",
            rejectedAt: new Date().toISOString()
          }
        : participant
    )
  );
  return rejected;
}

function mockListParticipants(draftId: string): readonly DraftParticipantDTO[] {
  ensureDraft(draftId);
  const participants = mockParticipants.get(draftId) ?? participantsFromZhixu(draftId);
  mockParticipants.set(draftId, participants);
  return participants;
}

function mockPrepareOrderTrigger(
  draftId: string,
  input: { readonly walletAddress: string }
): PreparedOrderTriggerDTO {
  const draft = ensureDraft(draftId);
  const participants = mockListParticipants(draftId);
  const requiredReady = participants.filter((participant) => participant.required).every((participant) =>
    participant.status === "accepted"
  );
  if (!requiredReady) {
    throw new ApiRequestError(`/product/order-drafts/${draftId}/prepare-trigger`, 409, "required_participants_missing");
  }
  const prepareId = `prepare-${pseudoHash(`${draftId}:${input.walletAddress}:${Date.now()}`).slice(2, 14)}`;
  const orderId = pseudoHash(`${draftId}:order`);
  return {
    prepareId,
    triggerId: `trigger-${prepareId.slice("prepare-".length)}`,
    draftId,
    orderId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    submitter: input.walletAddress,
    typedData: {
      domain: {
        name: "UVPStateMachine",
        version: "0.7",
        chainId: 31337,
        verifyingContract: "0x0000000000000000000000000000000000000001"
      },
      types: {
        UVPStateMachineTriggerOrderFromOutside: [
          { name: "orderId", type: "bytes32" },
          { name: "planId", type: "bytes32" },
          { name: "submitter", type: "address" },
          { name: "deadline", type: "uint256" }
        ]
      },
      primaryType: "UVPStateMachineTriggerOrderFromOutside",
      message: {
        orderId,
        planId: draft.planId,
        submitter: input.walletAddress,
        deadline: Math.floor(Date.now() / 1000 + 3600).toString()
      }
    }
  };
}

function mockTriggerOrder(draftId: string, input: TriggerOrderInput): ProductOrderDraftDTO {
  const draft = ensureDraft(draftId);
  const submitted: ProductOrderDraftDTO = {
    ...draft,
    status: "triggered",
    triggeredOrderId: pseudoHash(`${draftId}:${input.prepareId}:order`),
    triggerTxHash: pseudoHash(`${draftId}:trigger:${input.signature}`),
    updatedAt: new Date().toISOString()
  };
  mockDrafts.set(draftId, submitted);
  return submitted;
}

function mockUploadEvidence(input: UploadEvidenceInput): EvidenceObjectDTO {
  const now = new Date().toISOString();
  const evidenceId = `evidence-${evidenceSequence.toString().padStart(3, "0")}`;
  evidenceSequence += 1;
  const contentHash = pseudoHash(`${input.file.name}:${input.file.size}:${input.file.type}`);
  const metadataHash = pseudoHash(JSON.stringify(input.metadata));
  const payloadHash = pseudoHash(`${contentHash}:${metadataHash}:${input.documentType}:${input.orderId ?? input.draftId ?? ""}:${input.stageIdentifier}`);
  const evidence: EvidenceObjectDTO = {
    evidenceId,
    orderId: input.orderId,
    draftId: input.draftId,
    taskId: input.taskId,
    stageIdentifier: input.stageIdentifier,
    ownerParticipantId: "current-user",
    fileName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    size: input.file.size,
    storageURI: `mock://evidence/${evidenceId}`,
    contentHash,
    metadataHash,
    payloadHash,
    payloadRef: `mock://payload/${evidenceId}`,
    status: "uploaded",
    createdAt: now
  };
  mockEvidence.set(evidenceId, evidence);
  return evidence;
}

function mockGetEvidence(evidenceId: string): EvidenceObjectDTO {
  const evidence = mockEvidence.get(evidenceId);
  if (!evidence) {
    throw new ApiRequestError(`/product/evidence/${evidenceId}`, 404, "evidence_not_found");
  }
  return evidence;
}

function mockGetEvidenceProof(evidenceId: string): EvidenceProofDTO {
  const evidence = mockGetEvidence(evidenceId);
  return {
    payloadHash: evidence.payloadHash,
    contentHash: evidence.contentHash,
    metadataHash: evidence.metadataHash,
    boundSignalTxHash: evidence.boundSignalTxHash,
    verificationStatus: evidence.status === "bound" ? "matched" : "unbound"
  };
}

function mockPrepareTaskSubmit(taskId: string, input: PrepareSubmitInput): PreparedSubmitDTO {
  const task = taskId === demoTask.taskId ? demoTask : undefined;
  if (!task) {
    throw new ApiRequestError(`/product/tasks/${taskId}/prepare-submit`, 404, "task_not_found");
  }
  const evidence = input.evidenceIds.map((evidenceId) => mockGetEvidence(evidenceId));
  if (evidence.length === 0) {
    throw new ApiRequestError(`/product/tasks/${taskId}/prepare-submit`, 400, "evidence_required");
  }
  const now = Date.now();
  const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
  const fingerprint = evidence[0]?.payloadHash ?? pseudoHash(taskId);
  return {
    prepareId: `prepare-${pseudoHash(`${taskId}:${input.walletAddress}:${now}`).slice(2, 14)}`,
    taskId,
    expiresAt,
    summary: {
      orderTitle: task.orderTitle,
      stageName: task.stageName,
      actionLabel: intentLabel(input.intent),
      evidenceFingerprint: fingerprint,
      walletAddress: input.walletAddress,
      authorizationValidUntil: expiresAt
    },
    typedData: {
      domain: {
        name: "UVP Product Workbench",
        version: "1",
        chainId: 31337
      },
      types: {
        ProductTaskSubmit: [
          { name: "taskId", type: "string" },
          { name: "evidenceFingerprint", type: "bytes32" },
          { name: "walletAddress", type: "address" },
          { name: "deadline", type: "string" }
        ]
      },
      primaryType: "ProductTaskSubmit",
      message: {
        taskId,
        evidenceFingerprint: fingerprint,
        walletAddress: input.walletAddress,
        deadline: expiresAt
      }
    }
  };
}

function mockSubmitTask(taskId: string, input: SubmitTaskInput): ProductSubmissionDTO {
  const submissionId = `submission-${submissionSequence.toString().padStart(3, "0")}`;
  submissionSequence += 1;
  const submission: ProductSubmissionDTO & { readonly pollCount: number } = {
    submissionId,
    taskId,
    status: "submitted",
    statusLabel: "提交处理中",
    txHash: pseudoHash(`${taskId}:${input.prepareId}:${input.signature}`),
    retryable: false,
    proofRows: [
      { label: "提交记录", value: "已发送，等待确认" },
      { label: "提交编号", value: submissionId }
    ],
    pollCount: 0
  };
  mockSubmissions.set(submissionId, submission);
  return stripPollCount(submission);
}

function mockGetSubmission(submissionId: string): ProductSubmissionDTO {
  const submission = mockSubmissions.get(submissionId);
  if (!submission) {
    throw new ApiRequestError(`/product/submissions/${submissionId}`, 404, "submission_not_found");
  }
  if (submission.pollCount < 1) {
    const next = { ...submission, pollCount: submission.pollCount + 1 };
    mockSubmissions.set(submissionId, next);
    return stripPollCount(next);
  }
  const confirmed: ProductSubmissionDTO & { readonly pollCount: number } = {
    ...submission,
    status: "confirmed",
    statusLabel: "已确认",
    blockNumber: "18734562",
    proofRows: [
      { label: "交易编号", value: shortHash(submission.txHash ?? "") },
      { label: "区块高度", value: "18,734,562" },
      { label: "提交人", value: "当前钱包" }
    ],
    pollCount: submission.pollCount + 1
  };
  mockSubmissions.set(submissionId, confirmed);
  return stripPollCount(confirmed);
}

function participantsFromZhixu(draftId: string): readonly DraftParticipantDTO[] {
  return demoZhixuDetail.roleSlots.map((slot) => ({
    participantId: `${draftId}-${slot.slotId}`,
    draftId,
    roleSlotId: slot.slotId,
    roleLabel: slot.title,
    displayName: "",
    contact: "",
    status: slot.slotId === "maintainer" ? "accepted" : "missing",
    required: slot.required,
    ...(slot.slotId === "maintainer" ? { walletAddress: "platform", acceptedAt: new Date().toISOString() } : {})
  }));
}

function ensureDraft(draftId: string): ProductOrderDraftDTO {
  const draft = mockDrafts.get(draftId);
  if (!draft) {
    throw new ApiRequestError(`/product/order-drafts/${draftId}`, 404, "draft_not_found");
  }
  return draft;
}

function ensureInvite(inviteId: string): ProductInviteDTO {
  const invite = mockInvites.get(inviteId);
  if (!invite) {
    throw new ApiRequestError(`/product/invites/${inviteId}`, 404, "invite_not_found");
  }
  return invite;
}

function stripPollCount(submission: ProductSubmissionDTO & { readonly pollCount: number }): ProductSubmissionDTO {
  const { pollCount: _pollCount, ...publicSubmission } = submission;
  return publicSubmission;
}

const UVP_WORKBENCH_FETCH_TIMEOUT_MS = Number(
  import.meta.env.VITE_UVP_WORKBENCH_FETCH_TIMEOUT_MS
) || 6000;

async function fetchJsonWithTimeout<TResponse>(
  baseUrl: string,
  pathname: string,
  timeoutMs: number,
  init: { readonly method?: string; readonly body?: unknown } = {}
): Promise<TResponse> {
  const fetchPromise = fetchJson<TResponse>(baseUrl, pathname, init);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new ApiNetworkError(pathname, "请求超时", 0)), timeoutMs);
  });
  return await Promise.race([fetchPromise, timeoutPromise]);
}

async function fetchJson<TResponse>(
  baseUrl: string,
  pathname: string,
  init: { readonly method?: string; readonly body?: unknown } = {}
): Promise<TResponse> {
  const headers = new Headers();
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  if (import.meta.env.VITE_UVP_PRODUCT_E2E === "1") {
    headers.set("x-uvp-principal-id", "e2e-admin");
    headers.set("x-uvp-principal-role", "admin");
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method: init.method ?? "GET",
      headers,
      body
    });
  } catch (error) {
    throw new ApiNetworkError(pathname, error instanceof Error ? error.message : "network_error");
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      throw new ApiUnsupportedEndpointError(pathname, response.status, message);
    }
    throw new ApiRequestError(pathname, response.status, message);
  }
  return await response.json() as TResponse;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { readonly error?: string; readonly message?: string };
    return body.error ?? body.message ?? `${response.status}`;
  } catch {
    return `${response.status}`;
  }
}

interface SettledEndpointResult {
  readonly path: string;
  readonly result: PromiseSettledResult<unknown>;
}

function collectEndpointDiagnostics(endpoints: readonly SettledEndpointResult[]): readonly WorkbenchEndpointDiagnostic[] {
  return endpoints
    .filter(({ result }) => result.status === "rejected")
    .map(({ path, result }) => {
      const reason = (result as PromiseRejectedResult).reason;
      if (reason instanceof ApiRequestError) {
        return {
          endpoint: reason.pathname,
          status: reason.status,
          errorCode: extractErrorCode(reason.message),
          message: reason.message
        };
      }
      if (reason instanceof ApiNetworkError) {
        return {
          endpoint: reason.pathname,
          status: reason.status ?? 0,
          errorCode: extractErrorCode(reason.message),
          message: reason.message
        };
      }
      return {
        endpoint: path,
        status: 0,
        message: reason instanceof Error ? reason.message : "未知错误"
      };
    });
}

function settledValue<TValue>(
  settled: PromiseSettledResult<TValue>,
  path: string
): TValue | undefined {
  if (settled.status === "fulfilled") {
    return settled.value;
  }
  return undefined;
}

function extractErrorCode(message: string): string | undefined {
  if (isSnakeCaseIdentifier(message)) {
    return message;
  }
  const known: Record<string, string> = {
    "authentication timed out": "internal_server_error",
    "authentication failed": "auth_failed",
    "not found": "not_found",
    "unauthorized": "unauthorized",
    "forbidden": "forbidden",
    "network_error": "network_error",
    "product_storage_unavailable": "product_storage_unavailable"
  };
  const lower = message.toLowerCase();
  for (const [key, code] of Object.entries(known)) {
    if (lower.includes(key)) {
      return code;
    }
  }
  return undefined;
}

function isSnakeCaseIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9_]+$/.test(value) && value.includes("_") && value.length >= 6;
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}

function isSyncing(order: ProductOrderDTO | undefined, task: ProductTaskDTO | undefined): boolean {
  return order?.statusLabel.includes("同步") === true || task?.status === "blocked";
}

function isProductE2EEnabled(): boolean {
  return import.meta.env.VITE_UVP_PRODUCT_E2E === "1";
}

function readE2EApiBaseUrl(): string | undefined {
  return readQueryValue("productApiBase");
}

function isExplicitProductDemoMode(): boolean {
  return isExplicitFrontendDemoMode(import.meta.env, {
    demoEnabledAliases: ["VITE_UVP_PRODUCT_DEMO_MODE"],
    demoSelectedAliases: ["VITE_UVP_PRODUCT_DEMO_SELECTED"],
    queryKeys: ["demo"],
    storageKey: PRODUCT_DEMO_MODE_STORAGE_KEY
  });
}

function sortLatestProjectionFirst<TItem>(items: readonly TItem[]): readonly TItem[] {
  return [...items].sort((left, right) => projectionUpdatedAtBlock(right) - projectionUpdatedAtBlock(left));
}

function projectionUpdatedAtBlock(value: unknown): number {
  if (!isRecord(value) || !isRecord(value.projection)) {
    return 0;
  }
  const block = value.projection.updatedAtBlock;
  if (typeof block !== "string") {
    return 0;
  }
  const parsed = Number(block);
  return Number.isFinite(parsed) ? parsed : 0;
}

function intentLabel(intent: PrepareSubmitInput["intent"]): string {
  switch (intent) {
    case "confirm_stage":
      return "确认本阶段完成";
    case "reject_stage":
      return "驳回本阶段";
    case "raise_dispute":
      return "提出争议";
    case "resolve_dispute":
      return "处理争议";
  }
}

function pseudoHash(seed: string): string {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  let hex = "";
  for (let index = 0; index < 8; index += 1) {
    state ^= index + seed.length;
    state = Math.imul(state, 16777619);
    hex += (state >>> 0).toString(16).padStart(8, "0");
  }
  return `0x${hex.slice(0, 64)}`;
}

export function participantFromDraftParticipant(participant: DraftParticipantDTO): ParticipantDTO {
  return {
    participantId: participant.participantId,
    role: participant.roleLabel,
    duty: participant.required ? "关键参与方，需要确认职责" : "可选参与方",
    evidence: participant.required ? ["职责确认"] : ["可选确认"],
    status: participant.status === "accepted" ? "joined" : participant.status === "invited" ? "pending_confirmation" : "not_started",
    tone: participant.status === "accepted" ? "ok" : participant.status === "rejected" ? "warn" : "neutral"
  };
}
