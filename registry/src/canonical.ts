// Registry input canonicalization: EIP-712 field/key normalization is single-sourced
// in @uvp-eth/protocol-bindings; this module only translates registry error types
// and keeps the registry-specific signature-format rule.

import type { Hex } from "viem";
import {
  normalizeIdentityClaimTypedDataInput,
  normalizeZhixuRecordTypedDataInput
} from "@uvp-eth/protocol-bindings";
import { RegistrySignatureError, RegistryValidationError } from "./errors.js";
import type {
  IdentityClaimDraft,
  IdentityClaimFields,
  IdentityClaimKey,
  ZhixuRecordFields,
  ZhixuRecordKey
} from "./types.js";

const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;

export const REGISTRY_MAX_TEXT_BYTES = 2_048;
export const REGISTRY_MAX_ATTESTATION_REFS = 64;

export function normalizeZhixuRecordFields(fields: ZhixuRecordFields): ZhixuRecordFields {
  const normalized = asRegistryValidation(() => normalizeZhixuRecordTypedDataInput(fields));
  assertTextBounds(normalized.descriptorUri, "descriptorUri");
  assertTextBounds(normalized.descriptorHash, "descriptorHash");
  assertTextBounds(normalized.schemaHash, "schemaHash");
  assertTextBounds(normalized.version, "version");
  return normalized;
}

export function normalizeZhixuRecordKey(key: ZhixuRecordKey): ZhixuRecordKey {
  const normalized = asRegistryValidation(() => normalizeZhixuRecordTypedDataInput(key));
  return {
    chainId: normalized.chainId,
    planId: normalized.planId,
    planHash: normalized.planHash,
    registeredBy: normalized.registeredBy,
  };
}

export function normalizeIdentityClaimFields(fields: IdentityClaimDraft): IdentityClaimFields {
  const normalized = asRegistryValidation(() => normalizeIdentityClaimTypedDataInput(fields));
  assertTextBounds(normalized.subject, "subject");
  assertTextBounds(normalized.descriptorUri, "descriptorUri");
  assertTextBounds(normalized.descriptorHash, "descriptorHash");
  assertAttestationRefBounds(normalized.attestationRefs);
  return normalized;
}

export function normalizeIdentityClaimKey(key: IdentityClaimKey): IdentityClaimKey {
  const normalized = asRegistryValidation(() => normalizeIdentityClaimTypedDataInput(key));
  assertTextBounds(normalized.subject, "subject");
  return {
    chainId: normalized.chainId,
    wallet: normalized.wallet,
    subject: normalized.subject,
  };
}

export function requireSignature(value: string): Hex {
  if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) {
    throw new RegistrySignatureError("signature must be a 65-byte hex ECDSA signature");
  }
  return value.toLowerCase() as Hex;
}

function assertTextBounds(value: string | undefined, field: string): void {
  if (value === undefined) {
    return;
  }
  if (utf8Length(value) > REGISTRY_MAX_TEXT_BYTES) {
    throw new RegistryValidationError(
      `${field} must be at most ${REGISTRY_MAX_TEXT_BYTES} UTF-8 bytes`,
    );
  }
}

function assertAttestationRefBounds(refs: readonly string[]): void {
  if (refs.length > REGISTRY_MAX_ATTESTATION_REFS) {
    throw new RegistryValidationError(
      `attestationRefs must contain at most ${REGISTRY_MAX_ATTESTATION_REFS} entries`,
    );
  }
  for (const ref of refs) {
    if (utf8Length(ref) > REGISTRY_MAX_TEXT_BYTES) {
      throw new RegistryValidationError(
        `attestationRefs entries must be at most ${REGISTRY_MAX_TEXT_BYTES} UTF-8 bytes`,
      );
    }
  }
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function asRegistryValidation<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new RegistryValidationError(error.message);
    }
    throw error;
  }
}
