// Registry input canonicalization: EIP-712 field/key normalization is single-sourced
// in @uvp-eth/protocol-bindings; this module only translates registry error types
// and keeps the registry-specific signature-format rule.

import type { Hex } from "viem";
import {
  normalizeIdentityClaimTypedDataInput,
  normalizeIdentityClaimTypedDataKey,
  normalizeZhixuRecordTypedDataInput,
  normalizeZhixuRecordTypedDataKey
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

export function normalizeZhixuRecordFields(fields: ZhixuRecordFields): ZhixuRecordFields {
  return asRegistryValidation(() => normalizeZhixuRecordTypedDataInput(fields));
}

export function normalizeZhixuRecordKey(key: ZhixuRecordKey): ZhixuRecordKey {
  return asRegistryValidation(() => normalizeZhixuRecordTypedDataKey(key));
}

export function normalizeIdentityClaimFields(fields: IdentityClaimDraft): IdentityClaimFields {
  return asRegistryValidation(() => normalizeIdentityClaimTypedDataInput(fields));
}

export function normalizeIdentityClaimKey(key: IdentityClaimKey): IdentityClaimKey {
  return asRegistryValidation(() => normalizeIdentityClaimTypedDataKey(key));
}

export function requireSignature(value: string): Hex {
  if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) {
    throw new RegistrySignatureError("signature must be a 65-byte hex ECDSA signature");
  }
  return value.toLowerCase() as Hex;
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
