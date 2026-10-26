// Storage contract for the zhixu registry: append-only records, no approval or curation state.

import type {
  IdentityClaim,
  IdentityClaimKey,
  SignedIdentityClaimInput,
  SignedZhixuRecordInput,
  ZhixuRecord,
  ZhixuRecordKey
} from "./types.js";

export interface ZhixuRegistryStore {
  registerZhixuRecord(input: SignedZhixuRecordInput): Promise<ZhixuRecord>;
  getZhixuRecord(key: ZhixuRecordKey): Promise<ZhixuRecord | undefined>;
  registerIdentityClaim(input: SignedIdentityClaimInput): Promise<IdentityClaim>;
  getIdentityClaim(key: IdentityClaimKey): Promise<IdentityClaim | undefined>;
}
