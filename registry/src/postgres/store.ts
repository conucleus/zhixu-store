// Postgres-backed registry: verifies the wallet signature, then appends one immutable row per key.

import type { Pool, QueryResultRow } from "pg";
import {
  normalizeIdentityClaimFields,
  normalizeIdentityClaimKey,
  normalizeZhixuRecordFields,
  normalizeZhixuRecordKey,
  requireSignature
} from "../canonical.js";
import { RegistryEntryConflictError } from "../errors.js";
import type { ZhixuRegistryStore } from "../store.js";
import type {
  IdentityClaim,
  IdentityClaimKey,
  SignedIdentityClaimInput,
  SignedZhixuRecordInput,
  ZhixuRecord,
  ZhixuRecordKey
} from "../types.js";
import { assertIdentityClaimSignature, assertZhixuRecordSignature } from "../verify.js";

const ZHIXU_RECORD_COLUMNS = [
  "chain_id",
  "plan_id",
  "plan_hash",
  "descriptor_uri",
  "descriptor_hash",
  "schema_hash",
  "version",
  "registered_by",
  "signature",
  "created_at"
].join(", ");

const IDENTITY_CLAIM_COLUMNS = [
  "chain_id",
  "wallet",
  "subject",
  "descriptor_uri",
  "descriptor_hash",
  "attestation_refs",
  "signature",
  "created_at"
].join(", ");

interface ZhixuRecordRow extends QueryResultRow {
  readonly chain_id: string;
  readonly plan_id: string;
  readonly plan_hash: string;
  readonly descriptor_uri: string | null;
  readonly descriptor_hash: string | null;
  readonly schema_hash: string | null;
  readonly version: string | null;
  readonly registered_by: string;
  readonly signature: string;
  readonly created_at: Date;
}

interface IdentityClaimRow extends QueryResultRow {
  readonly chain_id: string;
  readonly wallet: string;
  readonly subject: string;
  readonly descriptor_uri: string | null;
  readonly descriptor_hash: string | null;
  readonly attestation_refs: readonly string[];
  readonly signature: string;
  readonly created_at: Date;
}

export interface PostgresZhixuRegistryStoreOptions {
  readonly pool: Pool;
  readonly now?: () => Date;
}

export class PostgresZhixuRegistryStore implements ZhixuRegistryStore {
  readonly #pool: Pool;
  readonly #now: () => Date;

  constructor(options: PostgresZhixuRegistryStoreOptions) {
    this.#pool = options.pool;
    this.#now = options.now ?? (() => new Date());
  }

  async registerZhixuRecord(input: SignedZhixuRecordInput): Promise<ZhixuRecord> {
    const fields = normalizeZhixuRecordFields(input);
    const signature = requireSignature(input.signature);
    await assertZhixuRecordSignature(fields, signature);

    const result = await this.#pool.query<ZhixuRecordRow>(
      `INSERT INTO zhixu_registry_zhixu_records (chain_id, plan_id, plan_hash, descriptor_uri, descriptor_hash, schema_hash, version, registered_by, signature, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (chain_id, plan_id, plan_hash) DO NOTHING
       RETURNING ${ZHIXU_RECORD_COLUMNS}`,
      [
        fields.chainId,
        fields.planId,
        fields.planHash,
        fields.descriptorUri ?? null,
        fields.descriptorHash ?? null,
        fields.schemaHash ?? null,
        fields.version ?? null,
        fields.registeredBy,
        signature,
        this.#now().toISOString()
      ]
    );
    const row = result.rows[0];
    if (!row) {
      throw new RegistryEntryConflictError("zhixu record already exists for this chainId/planId/planHash", {
        chainId: fields.chainId,
        planId: fields.planId,
        planHash: fields.planHash
      });
    }
    return zhixuRecordFromRow(row);
  }

  async getZhixuRecord(key: ZhixuRecordKey): Promise<ZhixuRecord | undefined> {
    const normalized = normalizeZhixuRecordKey(key);
    const result = await this.#pool.query<ZhixuRecordRow>(
      `SELECT ${ZHIXU_RECORD_COLUMNS} FROM zhixu_registry_zhixu_records
       WHERE chain_id = $1 AND plan_id = $2 AND plan_hash = $3`,
      [normalized.chainId, normalized.planId, normalized.planHash]
    );
    const row = result.rows[0];
    return row ? zhixuRecordFromRow(row) : undefined;
  }

  async registerIdentityClaim(input: SignedIdentityClaimInput): Promise<IdentityClaim> {
    const fields = normalizeIdentityClaimFields(input);
    const signature = requireSignature(input.signature);
    await assertIdentityClaimSignature(fields, signature);

    const result = await this.#pool.query<IdentityClaimRow>(
      `INSERT INTO zhixu_registry_identity_claims (chain_id, wallet, subject, descriptor_uri, descriptor_hash, attestation_refs, signature, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (chain_id, wallet, subject) DO NOTHING
       RETURNING ${IDENTITY_CLAIM_COLUMNS}`,
      [
        fields.chainId,
        fields.wallet,
        fields.subject,
        fields.descriptorUri ?? null,
        fields.descriptorHash ?? null,
        fields.attestationRefs,
        signature,
        this.#now().toISOString()
      ]
    );
    const row = result.rows[0];
    if (!row) {
      throw new RegistryEntryConflictError("identity claim already exists for this chainId/wallet/subject", {
        chainId: fields.chainId,
        wallet: fields.wallet,
        subject: fields.subject
      });
    }
    return identityClaimFromRow(row);
  }

  async getIdentityClaim(key: IdentityClaimKey): Promise<IdentityClaim | undefined> {
    const normalized = normalizeIdentityClaimKey(key);
    const result = await this.#pool.query<IdentityClaimRow>(
      `SELECT ${IDENTITY_CLAIM_COLUMNS} FROM zhixu_registry_identity_claims
       WHERE chain_id = $1 AND wallet = $2 AND subject = $3`,
      [normalized.chainId, normalized.wallet, normalized.subject]
    );
    const row = result.rows[0];
    return row ? identityClaimFromRow(row) : undefined;
  }
}

function zhixuRecordFromRow(row: ZhixuRecordRow): ZhixuRecord {
  return {
    chainId: Number(row.chain_id),
    planId: row.plan_id,
    planHash: row.plan_hash,
    ...(row.descriptor_uri !== null ? { descriptorUri: row.descriptor_uri } : {}),
    ...(row.descriptor_hash !== null ? { descriptorHash: row.descriptor_hash } : {}),
    ...(row.schema_hash !== null ? { schemaHash: row.schema_hash } : {}),
    ...(row.version !== null ? { version: row.version } : {}),
    registeredBy: row.registered_by,
    signature: row.signature,
    createdAt: row.created_at.toISOString()
  };
}

function identityClaimFromRow(row: IdentityClaimRow): IdentityClaim {
  return {
    chainId: Number(row.chain_id),
    wallet: row.wallet,
    subject: row.subject,
    ...(row.descriptor_uri !== null ? { descriptorUri: row.descriptor_uri } : {}),
    ...(row.descriptor_hash !== null ? { descriptorHash: row.descriptor_hash } : {}),
    attestationRefs: [...row.attestation_refs],
    signature: row.signature,
    createdAt: row.created_at.toISOString()
  };
}
