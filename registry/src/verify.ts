// Write-side signature verification: a registration is accepted only from the wallet it names.

import { verifyTypedData, type Hex } from "viem";
import { buildZhixuRecordTypedData } from "@uvp-eth/protocol-bindings";
import { requireSignature } from "./canonical.js";
import { RegistrySignatureError } from "./errors.js";
import type { ZhixuRecordFields } from "./types.js";

export async function assertZhixuRecordSignature(fields: ZhixuRecordFields, signature: string): Promise<void> {
  const typed = buildZhixuRecordTypedData(fields);
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
