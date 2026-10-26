// Canonicalization for registry inputs: keys, self-described text, opaque refs, and signatures.

import { isAddress, type Hex } from "viem";
import { RegistrySignatureError, RegistryValidationError } from "./errors";
import type {
  IdentityClaimDraft,
  IdentityClaimFields,
  IdentityClaimKey,
  ZhixuRecordFields,
  ZhixuRecordKey
} from "./types";

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;

export function normalizeZhixuRecordFields(fields: ZhixuRecordFields): ZhixuRecordFields {
  const descriptorUri = optionalText(fields.descriptorUri, "descriptorUri");
  const descriptorHash = optionalText(fields.descriptorHash, "descriptorHash");
  const schemaHash = optionalText(fields.schemaHash, "schemaHash");
  const version = optionalText(fields.version, "version");
  return {
    ...normalizeZhixuRecordKey(fields),
    registeredBy: requireAddress(fields.registeredBy, "registeredBy"),
    ...(descriptorUri !== undefined ? { descriptorUri } : {}),
    ...(descriptorHash !== undefined ? { descriptorHash } : {}),
    ...(schemaHash !== undefined ? { schemaHash } : {}),
    ...(version !== undefined ? { version } : {})
  };
}

export function normalizeZhixuRecordKey(key: ZhixuRecordKey): ZhixuRecordKey {
  return {
    chainId: requireChainId(key.chainId),
    planId: requireBytes32(key.planId, "planId"),
    planHash: requireBytes32(key.planHash, "planHash")
  };
}

export function normalizeIdentityClaimFields(fields: IdentityClaimDraft): IdentityClaimFields {
  const descriptorUri = optionalText(fields.descriptorUri, "descriptorUri");
  const descriptorHash = optionalText(fields.descriptorHash, "descriptorHash");
  return {
    ...normalizeIdentityClaimKey(fields),
    ...(descriptorUri !== undefined ? { descriptorUri } : {}),
    ...(descriptorHash !== undefined ? { descriptorHash } : {}),
    attestationRefs: normalizeAttestationRefs(fields.attestationRefs)
  };
}

export function normalizeIdentityClaimKey(key: IdentityClaimKey): IdentityClaimKey {
  return {
    chainId: requireChainId(key.chainId),
    wallet: requireAddress(key.wallet, "wallet"),
    subject: requireSubject(key.subject)
  };
}

export function requireSignature(value: string): Hex {
  if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) {
    throw new RegistrySignatureError("signature must be a 65-byte hex ECDSA signature");
  }
  return value.toLowerCase() as Hex;
}

function requireChainId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("chainId must be a positive safe integer");
  }
  return value;
}

function requireBytes32(value: string, field: string): Hex {
  if (typeof value !== "string" || !BYTES32_PATTERN.test(value)) {
    throw new RegistryValidationError(`${field} must be a 32-byte hex value`);
  }
  return value.toLowerCase() as Hex;
}

function requireAddress(value: string, field: string): string {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new RegistryValidationError(`${field} must be an EVM address`);
  }
  return value.toLowerCase();
}

function requireSubject(value: string): string {
  if (typeof value !== "string") {
    throw new RegistryValidationError("subject must be a self-described string");
  }
  const subject = value.trim();
  if (subject.length === 0) {
    throw new RegistryValidationError("subject must be a non-empty self-described string");
  }
  return subject;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new RegistryValidationError(`${field} must be a string when present`);
  }
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function normalizeAttestationRefs(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new RegistryValidationError("attestationRefs must be an array of opaque refs");
  }
  return value.map((ref, index) => {
    if (typeof ref !== "string" || ref.trim().length === 0) {
      throw new RegistryValidationError(`attestationRefs[${index}] must be a non-empty opaque ref`);
    }
    return ref.trim();
  });
}
