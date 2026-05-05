import type {
  ChainAttestationStatus,
  StoreConsoleSummaryDTO,
  StoreProductSchemaDTO,
  StoreProductSchemaValidationDTO,
  StoreSearchResponseDTO,
  StoreSearchType,
  StoreZhixuConsoleDTO,
  StoreZhixuLifecycleStatus
} from "@uvp-eth/product-dto";

export type StoreAccessLevel = "anonymous_read" | "store_read" | "store_operator" | "store_admin";
export type StoreAuthMode =
  | "anonymous"
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
  | "store.draft.attestation.request"
  | "store.version.activate"
  | "store.version.deprecate"
  | "store.version.revocation.request"
  | "store.supplier.create"
  | "store.supplier.review"
  | "store.supplier.tags.update"
  | "store.supplier.attestation.request"
  | "store.supplier.revocation.request"
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
}

export interface StoreSessionDTO {
  readonly authenticated: boolean;
  readonly principalId?: string;
  readonly accessLevel: StoreAccessLevel;
  readonly roles: readonly StoreRole[];
  readonly capabilities: readonly StoreCapability[];
  readonly authMode: StoreAuthMode;
}

export type StoreApiSource =
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

export type StoreZhixuDraftSourceKind = "zhixu_yaml" | "onchain_hook_plan_manifest";

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
  | "broadcasting"
  | "indexing"
  | "active"
  | "failed"
  | "stale"
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

export type StoreTrustProjectionEventName = "PlanAttested" | "PlanRevoked" | "MetadataMismatch";
export type StoreTrustProjectionIndexStatus = "not_requested" | "broadcasting" | "indexing" | "indexed" | "stale" | "revoked" | "failed";

export interface StoreZhixuDraftProjectionDTO {
  readonly sourceOfTruth: "trust-registry-events";
  readonly indexStatus: StoreTrustProjectionIndexStatus;
  readonly eventName?: StoreTrustProjectionEventName;
  readonly planId?: string;
  readonly planHash?: string;
  readonly artifactHash?: string;
  readonly metadataMatches?: boolean;
  readonly txHash?: string;
  readonly blockNumber?: string;
  readonly indexedAt?: string;
  readonly message?: string;
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
  readonly governanceTxLogId?: string;
  readonly projection?: StoreZhixuDraftProjectionDTO;
  readonly errors: readonly { readonly code: string; readonly message: string; readonly path?: string }[];
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

export interface StoreZhixuDraftAttestationInput {
  readonly metadataURI?: string;
  readonly metadata?: unknown;
  readonly policy?: unknown;
  readonly confirmation?: {
    readonly draftId?: string;
    readonly planId?: string;
    readonly planHash?: string;
  };
}

export interface StoreZhixuDraftAttestationResultDTO {
  readonly draft: StoreZhixuDraftDTO;
  readonly attestation?: unknown;
}

export interface StoreSearchInput {
  readonly keyword?: string;
  readonly type?: StoreSearchType;
  readonly limit?: number;
}

export interface StoreSupplierDTO {
  readonly supplierId: string;
  readonly displayName: string;
  readonly wallet?: string;
  readonly status: ChainAttestationStatus;
  readonly capabilityLabel: string;
  readonly updatedAt?: string;
}

export interface StoreRuntimeSummaryDTO {
  readonly activeZhixus: number;
  readonly runningOrders: number;
  readonly openTasks: number;
  readonly trustedSuppliers: number;
  readonly sourceOfTruth: "contracts-and-chain-events";
}

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
  readonly attestationStatus: ChainAttestationStatus;
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
  | "source_version_not_attested"
  | "target_version_not_attested"
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

export interface StoreDockingValidationInput {
  readonly draftSignalMap: readonly StoreDraftSignalMapEntryDTO[];
}
