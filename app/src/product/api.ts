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
  isRecord,
  normalizeBaseUrl,
  resolveFrontendApiBaseUrl,
  shortHash
} from "../shared/frontend";

export { shortHash } from "../shared/frontend";

export type ProductApiSource = {
  readonly kind: "real";
  readonly baseUrl: string;
};

export interface ProductApiResult<TData> {
  readonly data: TData;
  readonly source: ProductApiSource;
}

export interface ProductWorkbenchData {
  readonly participant?: ProductParticipantProfileDTO | undefined;
  readonly zhixus: readonly ZhixuDetailDTO[];
  readonly orders: readonly ProductOrderDTO[];
  readonly tasks: readonly ProductTaskDTO[];
  readonly zhixu?: ZhixuDetailDTO | undefined;
  readonly order?: ProductOrderDTO | undefined;
  readonly activeTask?: ProductTaskDTO | undefined;
  readonly source: ProductApiSource;
  readonly syncState: ProductSyncState;
  /**
   * 加载过程中容忍的部分失败（如单个秩序详情 404）。
   * 非空表示本次数据是降级结果，界面必须如实提示。
   */
  readonly diagnostics: readonly WorkbenchEndpointDiagnostic[];
}

/**
 * `/product/orders` and `/product/tasks` add projection freshness metadata to
 * the frozen Product DTOs.  Keep that transport extension explicit here: the
 * frozen DTO itself deliberately does not claim to contain `projection`.
 */
interface ProductProjectionFreshnessDTO {
  readonly updatedAtBlock?: string | undefined;
}

type ProductOrderApiDTO = ProductOrderDTO & {
  readonly projection?: ProductProjectionFreshnessDTO | undefined;
};

type ProductTaskApiDTO = ProductTaskDTO & {
  readonly projection?: ProductProjectionFreshnessDTO | undefined;
};

/** 工作台数据同步态：ready=链上投影已就绪，syncing=仍在追赶链上事件。 */
export type ProductSyncState = "ready" | "syncing";

export interface WorkbenchEndpointDiagnostic {
  readonly endpoint: string;
  readonly status: number;
  readonly errorCode?: string | undefined;
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
  readonly goods?: readonly string[];
  readonly totalAmount: string;
  readonly currency: string;
  readonly notes?: string;
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
  readonly displayName?: string | undefined;
  readonly required?: boolean | undefined;
}

export type EvidenceStatus = "uploaded" | "bound" | "revoked" | "quarantined";

export interface EvidenceObjectDTO {
  readonly evidenceId: string;
  readonly orderId?: string | undefined;
  readonly draftId?: string | undefined;
  readonly taskId?: string | undefined;
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
  readonly boundSignalTxHash?: string | undefined;
}

export interface EvidenceMetadataDTO {
  readonly evidenceId?: string | undefined;
  readonly businessLabel: string;
  readonly description?: string | undefined;
  readonly documentType: string;
  readonly issuer?: string | undefined;
  readonly issuedAt?: string | undefined;
  readonly fields?: Readonly<Record<string, string>> | undefined;
  readonly redactionPolicy?: string | undefined;
}

export interface EvidenceProofDTO {
  readonly payloadHash: string;
  readonly contentHash: string;
  readonly metadataHash: string;
  readonly boundSignalTxHash?: string | undefined;
  readonly blockNumber?: string | undefined;
  readonly submitter?: string | undefined;
  readonly verificationStatus: "unbound" | "matched" | "mismatch" | "missing_file";
}

export interface UploadEvidenceInput {
  readonly file: File;
  readonly orderId?: string | undefined;
  readonly draftId?: string | undefined;
  readonly taskId?: string | undefined;
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
  readonly txHash?: string | undefined;
  readonly blockNumber?: string | undefined;
  readonly errorCode?: string | undefined;
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
  readonly summary?: Readonly<Record<string, unknown>> | undefined;
}

export interface TriggerOrderInput {
  readonly prepareId: string;
  readonly signature: string;
  readonly walletAddress: string;
}

export interface ProductApiClient {
  readonly baseUrl?: string | undefined;
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

export function createProductApiClient(): ProductApiClient {
  const baseUrl = normalizeBaseUrl(resolveFrontendApiBaseUrl(import.meta.env));
  return new HttpProductApiClient(baseUrl);
}

/**
 * 生产与测试共用的 HTTP 客户端。
 * fetchImpl 仅用于测试注入；生产代码必须使用默认的全局 fetch。
 */
export class HttpProductApiClient implements ProductApiClient {
  readonly baseUrl?: string | undefined;

  constructor(baseUrl: string | undefined, options: { readonly fetchImpl?: typeof fetch } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  private readonly fetchImpl: typeof fetch;

  async loadWorkbenchData(): Promise<ProductWorkbenchData> {
    if (!this.baseUrl) {
      throw new ApiMissingConfigError("/product/zhixus", "API base URL is not configured");
    }

    const zhixusResponse = await fetchJson<{ readonly zhixus: readonly ZhixuSummaryDTO[] }>(
      this.baseUrl,
      "/product/zhixus",
      {},
      this.fetchImpl
    );
    // Restricted plans are still eligible when their frozen lifecycle says
    // active; do not silently hide them by checking approval alone.
    const visibleSummaries = zhixusResponse.zhixus.filter((zhixu) =>
      zhixu.reviewStatus === "approved" || zhixu.reviewStatus === "restricted"
    );
    const zhixuDetailAttempts = await Promise.all(
      visibleSummaries.map(async (summary) => ({
        path: `/product/zhixus/${encodeURIComponent(summary.zhixuId)}`,
        result: (await Promise.allSettled([this.fetchZhixuDetail(summary.zhixuId)]))[0]
      }))
    );
    const criticalEndpoints = [
      { path: "/product/orders", label: "orders" },
      { path: "/product/tasks", label: "tasks" }
    ] as const;
    const [ordersSettled, tasksSettled, meSettled] = await Promise.allSettled([
      fetchJson<{ readonly orders: readonly ProductOrderApiDTO[] }>(this.baseUrl, "/product/orders", {}, this.fetchImpl),
      fetchJson<{ readonly tasks: readonly ProductTaskApiDTO[] }>(this.baseUrl, "/product/tasks", {}, this.fetchImpl),
      fetchJson<{
        readonly participant: ProductParticipantProfileDTO;
        readonly summary?: unknown;
      }>(this.baseUrl, "/product/me", {}, this.fetchImpl)
    ]);

    const diagnostics = [
      ...collectEndpointDiagnostics(zhixuDetailAttempts),
      ...collectEndpointDiagnostics([
        { path: "/product/orders", result: ordersSettled },
        { path: "/product/tasks", result: tasksSettled },
        { path: "/product/me", result: meSettled }
      ])
    ];

    // 关键接口（orders/tasks）失败必须整体失败；
    // 单个秩序详情失败只降级该秩序：进诊断信息，其余秩序、订单和待办保持可用。
    const criticalFailed = diagnostics.some((diag) =>
      criticalEndpoints.some((endpoint) => endpoint.path === diag.endpoint)
    );
    if (criticalFailed) {
      throw new WorkbenchLoadError(diagnostics, { kind: "real", baseUrl: this.baseUrl });
    }

    const zhixus = zhixuDetailAttempts.flatMap(({ result }) =>
      result.status === "fulfilled" ? [result.value] : []
    );

    // A non-empty catalog whose every detail failed is an unavailable catalog,
    // not an empty one. Preserve endpoint diagnostics so the UI can explain
    // the failure instead of claiming that no orderable zhixu exists.
    if (visibleSummaries.length > 0 && zhixus.length === 0) {
      throw new WorkbenchLoadError(diagnostics, { kind: "real", baseUrl: this.baseUrl });
    }

    const ordersResponse = settledValue(ordersSettled, "/product/orders");
    const tasksResponse = settledValue(tasksSettled, "/product/tasks");
    // /product/me 解析失败时不反推身份：participant 保持未确认，由界面显式提示。
    const participant = meSettled.status === "fulfilled" ? participantFromMeResponse(meSettled.value) : undefined;
    if (!ordersResponse || !tasksResponse) {
      throw new WorkbenchLoadError(diagnostics, { kind: "real", baseUrl: this.baseUrl });
    }
    const orders = sortLatestProjectionFirst(ordersResponse.orders);
    const tasks = sortLatestProjectionFirst(tasksResponse.tasks);
    const order = orders.find((item) => item.status === "registered") ?? orders[0];
    const activeTask = tasks.find((task) => task.orderId === order?.orderId && task.status === "open") ??
      tasks.find((task) => task.status === "open") ??
      tasks[0];
    return {
      participant,
      zhixus,
      orders,
      tasks,
      zhixu: zhixus[0],
      order,
      activeTask,
      source: { kind: "real", baseUrl: this.baseUrl },
      syncState: isSyncing(activeTask) ? "syncing" : "ready",
      diagnostics
    };
  }

  async createOrderDraft(input: CreateOrderDraftInput): Promise<ProductApiResult<ProductOrderDraftDTO>> {
    const result = await this.requestWithSource<{ readonly draft: ProductOrderDraftDTO }>(
      "POST",
      "/product/order-drafts",
      input
    );
    return { data: result.data.draft, source: result.source };
  }

  async updateOrderDraft(draftId: string, input: UpdateOrderDraftInput): Promise<ProductApiResult<ProductOrderDraftDTO>> {
    const result = await this.requestWithSource<{ readonly draft: ProductOrderDraftDTO }>(
      "PATCH",
      `/product/order-drafts/${encodeURIComponent(draftId)}`,
      input
    );
    return { data: result.data.draft, source: result.source };
  }

  async getOrderDraft(draftId: string): Promise<ProductApiResult<ProductOrderDraftDTO>> {
    const result = await this.requestWithSource<{ readonly draft: ProductOrderDraftDTO }>(
      "GET",
      `/product/order-drafts/${encodeURIComponent(draftId)}`
    );
    return { data: result.data.draft, source: result.source };
  }

  async createInvite(draftId: string, input: CreateInviteInput): Promise<ProductApiResult<ProductInviteDTO>> {
    const result = await this.requestWithSource<{ readonly invite: ProductInviteDTO }>(
      "POST",
      `/product/orders/${encodeURIComponent(draftId)}/invites`,
      input
    );
    return { data: result.data.invite, source: result.source };
  }

  async acceptInvite(
    inviteId: string,
    input: { readonly displayName: string; readonly walletAddress: string; readonly contact: string }
  ): Promise<ProductApiResult<ProductInviteDTO>> {
    const result = await this.requestWithSource<{ readonly invite: ProductInviteDTO }>(
      "POST",
      `/product/invites/${encodeURIComponent(inviteId)}/accept`,
      input
    );
    return { data: result.data.invite, source: result.source };
  }

  async rejectInvite(inviteId: string): Promise<ProductApiResult<ProductInviteDTO>> {
    const result = await this.requestWithSource<{ readonly invite: ProductInviteDTO }>(
      "POST",
      `/product/invites/${encodeURIComponent(inviteId)}/reject`
    );
    return { data: result.data.invite, source: result.source };
  }

  async listParticipants(draftId: string): Promise<ProductApiResult<readonly DraftParticipantDTO[]>> {
    const result = await this.requestWithSource<{ readonly participants: readonly DraftParticipantDTO[] }>(
      "GET",
      `/product/orders/${encodeURIComponent(draftId)}/participants`
    );
    return { data: result.data.participants, source: result.source };
  }

  async prepareOrderTrigger(
    draftId: string,
    input: { readonly walletAddress: string }
  ): Promise<ProductApiResult<PreparedOrderTriggerDTO>> {
    const result = await this.requestWithSource<{ readonly prepared: PreparedOrderTriggerDTO }>(
      "POST",
      `/product/order-drafts/${encodeURIComponent(draftId)}/prepare-trigger`,
      input
    );
    return { data: result.data.prepared, source: result.source };
  }

  async triggerOrder(draftId: string, input: TriggerOrderInput): Promise<ProductApiResult<ProductOrderDraftDTO>> {
    const result = await this.requestWithSource<{ readonly draft: ProductOrderDraftDTO }>(
      "POST",
      `/product/order-drafts/${encodeURIComponent(draftId)}/trigger`,
      input
    );
    return { data: result.data.draft, source: result.source };
  }

  async uploadEvidence(input: UploadEvidenceInput): Promise<ProductApiResult<EvidenceObjectDTO>> {
    const result = await this.requestWithSource<unknown>(
      "POST",
      "/product/evidence",
      await evidenceUploadBody(input)
    );
    return { data: evidenceFromResponse(result.data), source: result.source };
  }

  async getEvidence(evidenceId: string): Promise<ProductApiResult<EvidenceObjectDTO>> {
    const result = await this.requestWithSource<{ readonly evidence: EvidenceObjectDTO }>(
      "GET",
      `/product/evidence/${encodeURIComponent(evidenceId)}`
    );
    return { data: result.data.evidence, source: result.source };
  }

  async getEvidenceProof(evidenceId: string): Promise<ProductApiResult<EvidenceProofDTO>> {
    const result = await this.requestWithSource<{ readonly proof: EvidenceProofDTO }>(
      "GET",
      `/product/evidence/${encodeURIComponent(evidenceId)}/proof`
    );
    return { data: result.data.proof, source: result.source };
  }

  async prepareTaskSubmit(taskId: string, input: PrepareSubmitInput): Promise<ProductApiResult<PreparedSubmitDTO>> {
    const result = await this.requestWithSource<unknown>(
      "POST",
      `/product/tasks/${encodeURIComponent(taskId)}/prepare-submit`,
      input
    );
    return { data: preparedSubmitFromResponse(result.data), source: result.source };
  }

  async submitTask(taskId: string, input: SubmitTaskInput): Promise<ProductApiResult<ProductSubmissionDTO>> {
    const result = await this.requestWithSource<unknown>(
      "POST",
      `/product/tasks/${encodeURIComponent(taskId)}/submit`,
      input
    );
    return { data: submissionFromResponse(result.data), source: result.source };
  }

  async getSubmission(submissionId: string): Promise<ProductApiResult<ProductSubmissionDTO>> {
    const result = await this.requestWithSource<unknown>(
      "GET",
      `/product/submissions/${encodeURIComponent(submissionId)}`
    );
    return { data: submissionFromResponse(result.data), source: result.source };
  }

  private async fetchZhixuDetail(zhixuId: string): Promise<ZhixuDetailDTO> {
    if (!this.baseUrl) {
      throw new ApiMissingConfigError(`/product/zhixus/${encodeURIComponent(zhixuId)}`, "API base URL is not configured");
    }
    const response = await fetchJson<{ readonly zhixu: ZhixuDetailDTO }>(
      this.baseUrl,
      `/product/zhixus/${encodeURIComponent(zhixuId)}`,
      {},
      this.fetchImpl
    );
    return response.zhixu;
  }

  private async requestWithSource<TData>(method: string, pathname: string, body?: unknown): Promise<ProductApiResult<TData>> {
    if (!this.baseUrl) {
      throw new ApiMissingConfigError(pathname, "API base URL is not configured");
    }
    const data = await this.requestJson<TData>(method, pathname, body);
    return { data, source: { kind: "real", baseUrl: this.baseUrl } };
  }

  private async requestJson<TResponse>(method: string, pathname: string, body?: unknown): Promise<TResponse> {
    if (!this.baseUrl) {
      throw new ApiMissingConfigError(pathname, "API base URL is not configured");
    }
    // 写路径同样必须走注入的 fetchImpl：读路径（loadWorkbenchData）已注入，
    // 测试里全局 fetch 不可达，漏传会在测试环境触发真实网络请求。
    return await fetchJson<TResponse>(this.baseUrl, pathname, { method, body }, this.fetchImpl);
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
  // 分块转换：10MB 文件逐字节拼接字符串是 O(n²) 级的重复拷贝。
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

function participantFromMeResponse(response: unknown): ProductParticipantProfileDTO | undefined {
  if (!isRecord(response) || !isRecord(response.participant)) {
    return undefined;
  }
  const participant = response.participant as Partial<ProductParticipantProfileDTO>;
  if (
    typeof participant.participantId !== "string" ||
    participant.participantId.length === 0 ||
    typeof participant.displayName !== "string" ||
    participant.displayName.length === 0 ||
    (participant.source !== "wallet" && participant.source !== "anonymous")
  ) {
    return undefined;
  }
  return participant as ProductParticipantProfileDTO;
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
      // 摘要标题用服务端的 taskTitle；orderId 是标识符不是可读标题。
      orderTitle: requiredString(humanSummary.taskTitle, "prepared_submit_response_invalid"),
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
  readonly status?: number | undefined;

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

const UVP_WORKBENCH_FETCH_TIMEOUT_MS = Number(
  (import.meta.env ?? {})?.VITE_UVP_WORKBENCH_FETCH_TIMEOUT_MS
) || 6000;

async function fetchJson<TResponse>(
  baseUrl: string,
  pathname: string,
  init: { readonly method?: string; readonly body?: unknown } = {},
  fetchImpl: typeof fetch = fetch.bind(globalThis)
): Promise<TResponse> {
  const headers = new Headers();
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  let response: Response;
  try {
    // 统一超时：详情/写路径/轮询与列表读同口径（默认 6s，可经
    // VITE_UVP_WORKBENCH_FETCH_TIMEOUT_MS 覆盖），否则任一挂起请求会让工作台无限 loading。
    response = await fetchImpl(`${baseUrl}${pathname}`, {
      method: init.method ?? "GET",
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(UVP_WORKBENCH_FETCH_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiNetworkError(pathname, "请求超时", 0);
    }
    throw new ApiNetworkError(pathname, error instanceof Error ? error.message : "network_error");
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      throw new ApiUnsupportedEndpointError(pathname, response.status, message);
    }
    throw new ApiRequestError(pathname, response.status, message);
  }
  try {
    return await response.json() as TResponse;
  } catch (error) {
    // 2xx 但不是 JSON：归入统一错误链，而不是抛裸 SyntaxError。
    throw new ApiRequestError(pathname, response.status, error instanceof Error ? error.message : "response_not_json");
  }
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

/**
 * 同步判据只用结构化状态字段：任务投影未跟上（含链上状态 unknown）时后端给出
 * blocked。订单 DTO 的 status 是单值联合（"registered"），结构上无法表达
 * "同步中"；statusLabel 只是展示文案，不得反过来充当状态机判据。
 */
function isSyncing(task: ProductTaskDTO | undefined): boolean {
  return task?.status === "blocked";
}

function sortLatestProjectionFirst<TItem extends { readonly projection?: ProductProjectionFreshnessDTO | undefined }>(items: readonly TItem[]): readonly TItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rightBlock = projectionUpdatedAtBlock(right.item);
      const leftBlock = projectionUpdatedAtBlock(left.item);
      if (rightBlock !== undefined && leftBlock !== undefined && rightBlock !== leftBlock) {
        return rightBlock > leftBlock ? 1 : -1;
      }
      if (rightBlock !== undefined && leftBlock === undefined) {
        return 1;
      }
      if (rightBlock === undefined && leftBlock !== undefined) {
        return -1;
      }
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function projectionUpdatedAtBlock(value: { readonly projection?: ProductProjectionFreshnessDTO | undefined }): bigint | undefined {
  const block = value.projection?.updatedAtBlock;
  if (typeof block !== "string" || !/^\d+$/u.test(block)) {
    return undefined;
  }
  return BigInt(block);
}
