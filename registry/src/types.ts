// Zhixu registry DTOs: permissionless, content-addressed descriptor records.

export interface ZhixuRecordKey {
  readonly chainId: number;
  readonly planId: string;
  readonly planHash: string;
  readonly registeredBy: string;
}

export interface ZhixuRecordFields extends ZhixuRecordKey {
  readonly descriptorUri?: string;
  readonly descriptorHash?: string;
  readonly schemaHash?: string;
  readonly version?: string;
}

export interface SignedZhixuRecordInput extends ZhixuRecordFields {
  readonly signature: string;
}

export interface ZhixuRecord extends ZhixuRecordFields {
  readonly signature: string;
  readonly createdAt: string;
}
