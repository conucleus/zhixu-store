// Zhixu registry DTOs: permissionless descriptor records and self-asserted wallet identity claims.

export interface ZhixuRecordKey {
  readonly chainId: number;
  readonly planId: string;
  readonly planHash: string;
}

export interface ZhixuRecordFields extends ZhixuRecordKey {
  readonly descriptorUri?: string;
  readonly descriptorHash?: string;
  readonly schemaHash?: string;
  readonly version?: string;
  readonly registeredBy: string;
}

export interface SignedZhixuRecordInput extends ZhixuRecordFields {
  readonly signature: string;
}

export interface ZhixuRecord extends ZhixuRecordFields {
  readonly signature: string;
  readonly createdAt: string;
}

export interface IdentityClaimKey {
  readonly chainId: number;
  readonly wallet: string;
  readonly subject: string;
}

export interface IdentityClaimFields extends IdentityClaimKey {
  readonly descriptorUri?: string;
  readonly descriptorHash?: string;
  readonly attestationRefs: readonly string[];
}

export interface IdentityClaimDraft extends IdentityClaimKey {
  readonly descriptorUri?: string;
  readonly descriptorHash?: string;
  readonly attestationRefs?: readonly string[];
}

export interface SignedIdentityClaimInput extends IdentityClaimDraft {
  readonly signature: string;
}

export interface IdentityClaim extends IdentityClaimKey {
  readonly descriptorUri?: string;
  readonly descriptorHash?: string;
  readonly attestationRefs: readonly string[];
  readonly signature: string;
  readonly createdAt: string;
}
