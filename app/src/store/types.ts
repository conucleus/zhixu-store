import type {
  PlanPublicationStatus,
  ChainProofRowDTO,
  StoreConsoleSummaryDTO,
  StoreProductSchemaDTO,
  StoreProductSchemaValidationDTO,
  StoreRuntimeSummaryDTO as FrozenStoreRuntimeSummaryDTO,
  StoreSearchResponseDTO,
  StoreSearchType,
  StoreSupplierReviewStatus,
  StoreZhixuConsoleDTO,
  StoreZhixuLifecycleStatus,
} from "@uvp-eth/product-dto";

export type StoreAccessLevel =
  | "anonymous_read"
  | "store_read"
  | "store_operator"
  | "store_admin";
export type StoreAuthMode =
  | "anonymous"
  | "wallet_session"
  | "dev_store_headers"
  | "dev_governance_admin_headers"
  | "dev_headers_disabled"
  | "jwt";

export type StoreRole = StoreAccessLevel | "store_reader" | "governance_admin";

export type StoreCapability =
  | "store.read"
  | "store.audit.read"
  | "store.draft.import"
  | "store.draft.compile"
  | "store.draft.schema.save"
  | "store.draft.review"
  | "store.version.activate"
  | "store.version.deprecate"
  | "store.listing.manage"
  | "store.supplier.create"
  | "store.supplier.review"
  | "store.supplier.tags.update"
  | "store.supplier.identity.register"
  | "store.supplier.identity.revoke"
  | "store.docking.create"
  | "store.docking.validate"
  | "store.docking.save";

export interface StoreAccessState {
  readonly level: StoreAccessLevel;
  readonly label: string;
  readonly roles: readonly StoreRole[];
  readonly capabilities: readonly StoreCapability[];
  readonly authMode: StoreAuthMode;
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly canAdmin: boolean;
  readonly headers: Readonly<Record<string, string>>;
  /** 会话已证明控制的钱包地址（未锚定为 undefined）。 */
  readonly anchoredAddress?: string | undefined;
  readonly anchorSource?: "wallet_session" | "dev_header" | undefined;
}

export interface StoreSessionDTO {
  readonly authenticated: boolean;
  readonly principalId?: string | undefined;
  readonly accessLevel: StoreAccessLevel;
  readonly roles: readonly StoreRole[];
  readonly capabilities: readonly StoreCapability[];
  readonly authMode: StoreAuthMode;
  /** 钱包会话叠加字段。 */
  readonly anchoredAddress?: string | undefined;
  readonly anchorSource?: string | undefined;
  readonly accountId?: string | undefined;
  readonly accountAddresses?: readonly StoreAccountAddressView[] | undefined;
}

export type StoreApiSource = {
  readonly kind: "real";
  readonly baseUrl: string;
};

export interface StoreApiResult<TData> {
  readonly data: TData;
  readonly source: StoreApiSource;
}

export interface StoreZhixuSearchResultDTO {
  readonly sourceOfTruth: "contracts-and-chain-events";
  readonly summary: StoreConsoleSummaryDTO;
  readonly zhixus: readonly StoreZhixuConsoleDTO[];
  readonly search?: StoreSearchResponseDTO;
}

export type StoreZhixuDraftSourceKind =
  | "zhixu_yaml"
  | "onchain_hook_plan_manifest";

export interface StoreImportZhixuDraftInput {
  readonly sourceKind: StoreZhixuDraftSourceKind;
  readonly content: string;
  readonly title?: string;
  readonly maintainer?: string;
  readonly publicSummary?: string;
  readonly tags?: readonly string[];
}

export type StoreZhixuDraftStatus =
  | "imported"
  | "compile_failed"
  | "compiled"
  | "submitted_for_review"
  | "approved_for_broadcast"
  | "active"
  | "rejected"
  | "revoked";

export interface StoreCompilePreviewDTO {
  readonly planId: string;
  readonly planHash: string;
  readonly artifactHash: string;
  readonly stageCount: number;
  readonly roleSlotCount: number;
  readonly sourceCount: number;
  readonly signalCount: number;
  readonly canonicalArtifactHash: string;
}

export interface StoreZhixuDraftDTO {
  readonly draftId: string;
  readonly status: StoreZhixuDraftStatus;
  readonly zhixuId?: string;
  readonly title: string;
  readonly maintainer: string;
  readonly compilePreview?: StoreCompilePreviewDTO;
  readonly productSchema?: StoreProductSchemaDTO;
  readonly reviewId?: string;
  readonly errors: readonly {
    readonly code: string;
    readonly message: string;
    readonly path?: string;
  }[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StoreProductSchemaUpdateResultDTO {
  readonly draft: StoreZhixuDraftDTO;
  readonly productSchema: StoreProductSchemaDTO;
  readonly validation: StoreProductSchemaValidationDTO;
}

export interface StoreZhixuDraftReviewResultDTO {
  readonly draft: StoreZhixuDraftDTO;
  readonly review?: unknown;
}

export interface StoreSearchInput {
  readonly keyword?: string;
  readonly type?: StoreSearchType;
  readonly limit?: number;
}

export interface StoreSupplierDTO {
  readonly supplierId: string;
  readonly supplierSubjectId: string;
  readonly displayName: string;
  readonly wallet?: string | undefined;
  readonly notificationProfile?: unknown | undefined;
  readonly notificationProfileHash?: string | undefined;
  readonly notificationUpdatedAt?: string | undefined;
  readonly identityStatus: "active" | "revoked" | "not_found";
  readonly identityLabel: string;
  readonly capabilityTags: readonly string[];
  readonly supportedRoleSlotIds: readonly string[];
  readonly supportedStageIds: readonly string[];
  readonly registryAddresses: readonly string[];
  readonly recentOrderCount: number;
  readonly openTaskCount: number;
  readonly reviewStatus: StoreSupplierReviewStatus;
  readonly metadataURI?: string | undefined;
  readonly proofRows: readonly ChainProofRowDTO[];
  readonly nextAction: string;
  readonly updatedAt: string;
}

export interface StoreSupplierCapabilityUpdateInput {
  readonly capabilityTags: readonly string[];
  readonly supportedRoleSlotIds: readonly string[];
  readonly supportedStageIds: readonly string[];
  readonly reviewStatus: StoreSupplierReviewStatus;
}

export interface StoreSupplierMutationResultDTO {
  readonly supplier: StoreSupplierDTO;
  readonly governance?: unknown;
}

/** Frozen Store runtime DTO; this consumer must not rename or drop fields. */
export type StoreRuntimeSummaryDTO = FrozenStoreRuntimeSummaryDTO;

export interface StoreDockingSessionCreateDTO {
  readonly sourceZhixuId: string;
  readonly targetZhixuId: string;
  readonly sourceVersionId?: string;
  readonly targetVersionId?: string;
}

export type StoreDockingSessionStatus = "draft" | "valid" | "invalid";

export interface StoreDockingZhixuRefDTO {
  readonly zhixuId: string;
  readonly title: string;
  readonly versionId?: string;
  readonly versionLabel: string;
  readonly lifecycleStatus: StoreZhixuLifecycleStatus;
  readonly publicationStatus: PlanPublicationStatus;
  readonly planId: string;
  readonly planHash: string;
}

export interface StoreDockingSignalPortDTO {
  readonly signalId: string;
  readonly label: string;
  readonly direction: "output" | "input";
  readonly stageId?: string;
  readonly stageName?: string;
  readonly roleSlotId?: string;
  readonly roleLabel?: string;
  readonly payloadSchemaHash?: string;
  readonly schemaHint?: string;
}

export interface StoreSignalMappingCandidateDTO {
  readonly candidateId: string;
  readonly sourceSignal: StoreDockingSignalPortDTO;
  readonly targetSignal: StoreDockingSignalPortDTO;
  readonly confidence: "high" | "medium" | "low";
  readonly reason: string;
}

export interface StoreDraftSignalMapEntryDTO {
  readonly entryId?: string;
  readonly sourceSignalId: string;
  readonly targetSignalId: string;
  readonly note?: string;
}

export type StoreDockingValidationErrorCode =
  | "source_output_not_found"
  | "target_input_not_found"
  | "incompatible_payload_hash"
  | "target_role_slot_mismatch"
  | "source_version_not_published"
  | "target_version_not_published"
  | "source_version_revoked"
  | "target_version_revoked"
  | "empty_signal_map";

export interface StoreDockingValidationErrorDTO {
  readonly code: StoreDockingValidationErrorCode;
  readonly message: string;
  readonly sourceSignalId?: string;
  readonly targetSignalId?: string;
}

export interface StoreDockingValidationDTO {
  readonly ok: boolean;
  readonly errors: readonly StoreDockingValidationErrorDTO[];
  readonly checkedAt?: string;
  readonly nonPublishing: true;
}

export interface StoreDockingSessionDTO {
  readonly sessionId: string;
  readonly status: StoreDockingSessionStatus;
  readonly source: StoreDockingZhixuRefDTO;
  readonly target: StoreDockingZhixuRefDTO;
  readonly candidateMappings: readonly StoreSignalMappingCandidateDTO[];
  readonly draftSignalMap: readonly StoreDraftSignalMapEntryDTO[];
  readonly validation: StoreDockingValidationDTO;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---- 会话配对 / 上架锚核验 / 装修权限 / 加入闭环 ----

export interface StoreAccountAddressView {
  readonly address: string;
  readonly status: "active" | "revoked";
  readonly anchoredAt: string;
}

export interface StoreWalletSessionChallengeDTO {
  readonly nonce: string;
  readonly address: string;
  readonly message: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface StoreWalletSessionView {
  readonly sessionId: string;
  readonly accountId: string;
  readonly anchoredAddress: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly addresses: readonly StoreAccountAddressView[];
}

export interface StoreWalletSessionVerifyResult {
  readonly token: string;
  readonly session: StoreWalletSessionView;
  readonly linkedToExistingAccount: boolean;
}

export interface StoreAnchorCheckView {
  readonly id: string;
  readonly label: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly outcome: "match" | "mismatch" | "unavailable";
}

export interface StoreAnchorVerificationView {
  readonly listingId: string;
  readonly planId: string;
  readonly status: "consistent" | "conflict" | "pending_indexing";
  readonly checks: readonly StoreAnchorCheckView[];
  readonly projection: {
    readonly planProjected: boolean;
    readonly planHash?: string | undefined;
    readonly publisher?: string | undefined;
    readonly stateMachineAddress?: string | undefined;
  };
  readonly chain?: {
    readonly source: "live_read";
    readonly planFinalized?: boolean | undefined;
    readonly planPublisher?: string | undefined;
  } | undefined;
  readonly verifiedAt: string;
}

export type StoreListingStatus = "imported" | "public" | "rejected" | "delisted";

export interface StoreListingView {
  readonly listingId: string;
  readonly planId: string;
  readonly planHashClaimed?: string | undefined;
  readonly status: StoreListingStatus;
  readonly importedAt: string;
  readonly reviewNote?: string | undefined;
  readonly delistReason?: string | undefined;
}

export interface StoreDecorationThemeView {
  readonly displayName?: string | undefined;
  readonly description?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly highlights?: readonly string[] | undefined;
}

export interface StoreDecorationEvidenceSpecSlotView {
  readonly key: string;
  readonly label: string;
  readonly inputKind?: "file" | "text" | "date" | undefined;
  readonly accept?: readonly string[] | undefined;
  readonly required?: boolean | undefined;
  readonly description?: string | undefined;
}

export interface StoreDecorationTaskDeclarationView {
  readonly stageId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly evidenceSpec?: readonly StoreDecorationEvidenceSpecSlotView[] | undefined;
}

export interface StoreDecorationDataView {
  readonly schemaVersion: "store-zhixu-decoration.v1";
  readonly theme?: StoreDecorationThemeView | undefined;
  readonly taskDeclarations?: readonly StoreDecorationTaskDeclarationView[] | undefined;
}

export interface StoreDecorationVersionView {
  readonly decorationId: string;
  readonly planId: string;
  readonly version: number;
  readonly data: StoreDecorationDataView;
  readonly authorAddress: string;
  readonly note?: string | undefined;
  readonly createdAt: string;
}

export interface StoreDecorationView {
  readonly planId: string;
  readonly current?: StoreDecorationVersionView | undefined;
  readonly versions: readonly StoreDecorationVersionView[];
}

export interface StoreDecorationPermissionView {
  readonly planId: string;
  readonly publisher?: string | undefined;
  readonly viewerIsPublisher: boolean;
  readonly viewerActiveDelegations: readonly {
    readonly delegationId: string;
    readonly publisherAddress: string;
    readonly memberAddress: string;
    readonly grantedAt: string;
  }[];
}

export interface StorePublisherDelegationView {
  readonly delegationId: string;
  readonly publisherAddress: string;
  readonly memberAddress: string;
  readonly grantedAt: string;
  readonly revokedAt?: string | undefined;
  readonly reason?: string | undefined;
}

export interface StoreZhixuOverlayView {
  readonly listing?: StoreListingView | undefined;
  readonly anchorVerification?: StoreAnchorVerificationView | undefined;
  readonly decoration?: StoreDecorationView | undefined;
  readonly viewerPermission?: StoreDecorationPermissionView | undefined;
}

export type StoreJoinApplicationStatus =
  | "applied"
  | "under_review"
  | "authorized"
  | "active"
  | "rejected"
  | "revoked";

export type StoreJoinAuthorizationKind = "signal_submitter" | "stage_executor";

export interface StoreJoinTxEvidenceView {
  readonly kind: "identity_binding" | "signal_submitter" | "stage_executor";
  readonly txHash?: string | undefined;
  readonly executionMode?: "simulated" | "on_chain" | undefined;
  readonly planId: string;
  readonly slot: string;
  readonly address: string;
  readonly status: "recorded" | "materialized";
  readonly recordedAt: string;
  readonly materializedAt?: string | undefined;
}

export interface StoreJoinApplicationView {
  readonly applicationId: string;
  readonly planId: string;
  readonly zhixuId?: string | undefined;
  readonly roleSlotId: string;
  readonly authorizationKind: StoreJoinAuthorizationKind;
  readonly stageId?: string | undefined;
  readonly applicantAddress: string;
  readonly applicantSubjectId: string;
  readonly applicantDisplayName?: string | undefined;
  readonly status: StoreJoinApplicationStatus;
  readonly txEvidence: readonly StoreJoinTxEvidenceView[];
  readonly rejectionReason?: string | undefined;
  readonly revocationReason?: string | undefined;
  readonly decidedAt?: string | undefined;
  readonly submittedAt: string;
  readonly updatedAt: string;
}

export interface StoreJoinApplicationEventView {
  readonly eventId: string;
  readonly applicationId: string;
  readonly type:
    | "submitted"
    | "review_started"
    | "approved"
    | "rejected"
    | "revoked"
    | "authorized"
    | "activated"
    | "binding_revoked";
  readonly actorAddress?: string | undefined;
  readonly reason?: string | undefined;
  readonly txHash?: string | undefined;
  readonly createdAt: string;
}

export interface StoreJoinApplicationDetailView {
  readonly application: StoreJoinApplicationView;
  readonly events: readonly StoreJoinApplicationEventView[];
  readonly identityPairing: {
    readonly bindingStatus: "active" | "revoked" | "not_found";
    readonly bindingAccount?: string | undefined;
    readonly bindingTxHash?: string | undefined;
  };
}

export interface StoreJoinApplicationSubmitInput {
  readonly planId: string;
  readonly roleSlotId: string;
  readonly authorizationKind: StoreJoinAuthorizationKind;
  readonly stageId?: string | undefined;
  readonly displayName?: string | undefined;
  readonly statement?: string | undefined;
}
