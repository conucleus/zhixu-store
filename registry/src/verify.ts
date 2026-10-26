// Write-side signature verification: a registration is accepted only from the wallet it names.

import { verifyTypedData, type Hex } from "viem";
import { requireSignature } from "./canonical.js";
import { identityClaimTypedData, zhixuRecordTypedData } from "./eip712.js";
import { RegistrySignatureError } from "./errors.js";
import type { IdentityClaimDraft, ZhixuRecordFields } from "./types.js";

export async function assertZhixuRecordSignature(fields: ZhixuRecordFields, signature: string): Promise<void> {
  const typed = zhixuRecordTypedData(fields);
  const valid = await verifySignature({
    address: typed.message.registeredBy,
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
    signature: requireSignature(signature)
  });
  if (!valid) {
    throw new RegistrySignatureError("zhixu record signature does not match registeredBy");
  }
}

export async function assertIdentityClaimSignature(fields: IdentityClaimDraft, signature: string): Promise<void> {
  const typed = identityClaimTypedData(fields);
  const valid = await verifySignature({
    address: typed.message.wallet,
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
    signature: requireSignature(signature)
  });
  if (!valid) {
    throw new RegistrySignatureError("identity claim signature does not match wallet");
  }
}

async function verifySignature(parameters: {
  readonly address: `0x${string}`;
  readonly domain: Parameters<typeof verifyTypedData>[0]["domain"];
  readonly types: Parameters<typeof verifyTypedData>[0]["types"];
  readonly primaryType: string;
  readonly message: Parameters<typeof verifyTypedData>[0]["message"];
  readonly signature: Hex;
}): Promise<boolean> {
  try {
    return await verifyTypedData(parameters);
  } catch (error) {
    throw new RegistrySignatureError("typed-data signature could not be verified", { cause: error });
  }
}
