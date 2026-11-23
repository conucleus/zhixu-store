// Storage contract for the zhixu registry: append-only records; approval/KYC records belong to a later phase.

import type {
  SignedZhixuRecordInput,
  ZhixuRecord,
  ZhixuRecordKey
} from "./types.js";

export interface ZhixuRegistryStore {
  registerZhixuRecord(input: SignedZhixuRecordInput): Promise<ZhixuRecord>;
  getZhixuRecord(key: ZhixuRecordKey): Promise<ZhixuRecord | undefined>;
}
