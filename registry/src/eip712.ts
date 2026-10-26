// EIP-712 single source for registry signatures: domain UVPZhixuRegistry/1 and typed-data helpers.

import type { Address, Hex, TypedData, TypedDataDomain } from "viem";
import { normalizeIdentityClaimFields, normalizeZhixuRecordFields } from "./canonical.js";
import type { IdentityClaimDraft, ZhixuRecordFields } from "./types.js";

export const ZHIXU_REGISTRY_DOMAIN_NAME = "UVPZhixuRegistry";
export const ZHIXU_REGISTRY_DOMAIN_VERSION = "1";

export const ZHIXU_RECORD_TYPES = {
  ZhixuRecord: [
    { name: "chainId", type: "uint256" },
    { name: "planId", type: "bytes32" },
    { name: "planHash", type: "bytes32" },
    { name: "descriptorUri", type: "string" },
    { name: "descriptorHash", type: "string" },
    { name: "schemaHash", type: "string" },
    { name: "version", type: "string" },
    { name: "registeredBy", type: "address" }
  ]
} as const satisfies TypedData;

export const IDENTITY_CLAIM_TYPES = {
  IdentityClaim: [
    { name: "chainId", type: "uint256" },
    { name: "wallet", type: "address" },
    { name: "subject", type: "string" },
    { name: "descriptorUri", type: "string" },
    { name: "descriptorHash", type: "string" },
    { name: "attestationRefs", type: "string[]" }
  ]
} as const satisfies TypedData;

export interface ZhixuRecordMessage extends Record<string, unknown> {
  readonly chainId: bigint;
  readonly planId: Hex;
  readonly planHash: Hex;
  readonly descriptorUri: string;
  readonly descriptorHash: string;
  readonly schemaHash: string;
  readonly version: string;
  readonly registeredBy: Address;
}

export interface IdentityClaimMessage extends Record<string, unknown> {
  readonly chainId: bigint;
  readonly wallet: Address;
  readonly subject: string;
  readonly descriptorUri: string;
  readonly descriptorHash: string;
  readonly attestationRefs: readonly string[];
}

export interface ZhixuRecordTypedData {
  readonly domain: TypedDataDomain;
  readonly types: typeof ZHIXU_RECORD_TYPES;
  readonly primaryType: "ZhixuRecord";
  readonly message: ZhixuRecordMessage;
}

export interface IdentityClaimTypedData {
  readonly domain: TypedDataDomain;
  readonly types: typeof IDENTITY_CLAIM_TYPES;
  readonly primaryType: "IdentityClaim";
  readonly message: IdentityClaimMessage;
}

export function zhixuRegistryDomain(chainId: number): TypedDataDomain {
  return {
    name: ZHIXU_REGISTRY_DOMAIN_NAME,
    version: ZHIXU_REGISTRY_DOMAIN_VERSION,
    chainId
  };
}

export function zhixuRecordTypedData(fields: ZhixuRecordFields): ZhixuRecordTypedData {
  const normalized = normalizeZhixuRecordFields(fields);
  return {
    domain: zhixuRegistryDomain(normalized.chainId),
    types: ZHIXU_RECORD_TYPES,
    primaryType: "ZhixuRecord",
    message: {
      chainId: BigInt(normalized.chainId),
      planId: normalized.planId as Hex,
      planHash: normalized.planHash as Hex,
      descriptorUri: normalized.descriptorUri ?? "",
      descriptorHash: normalized.descriptorHash ?? "",
      schemaHash: normalized.schemaHash ?? "",
      version: normalized.version ?? "",
      registeredBy: normalized.registeredBy as Address
    }
  };
}

export function identityClaimTypedData(fields: IdentityClaimDraft): IdentityClaimTypedData {
  const normalized = normalizeIdentityClaimFields(fields);
  return {
    domain: zhixuRegistryDomain(normalized.chainId),
    types: IDENTITY_CLAIM_TYPES,
    primaryType: "IdentityClaim",
    message: {
      chainId: BigInt(normalized.chainId),
      wallet: normalized.wallet as Address,
      subject: normalized.subject,
      descriptorUri: normalized.descriptorUri ?? "",
      descriptorHash: normalized.descriptorHash ?? "",
      attestationRefs: normalized.attestationRefs
    }
  };
}
