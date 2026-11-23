// Registry behavior: signed permissionless registration, immutable duplicates, bounded payloads.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Client, Pool } from "pg";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PostgresZhixuRegistryStore,
  RegistryEntryConflictError,
  RegistrySignatureError,
  RegistryValidationError,
  REGISTRY_MAX_TEXT_BYTES,
  runRegistryMigrations,
  type ZhixuRecordFields
} from "@uvp-eth/zhixu-registry";
import { buildZhixuRecordTypedData } from "@uvp-eth/protocol-bindings";

const testDatabaseUrl = process.env.ZHIXU_REGISTRY_POSTGRES_TEST_URL;
if (!testDatabaseUrl) {
  throw new Error("ZHIXU_REGISTRY_POSTGRES_TEST_URL is required to run registry tests");
}

const schema = `zhixu_registry_test_${randomBytes(6).toString("hex")}`;
const fixedNow = new Date("2026-10-26T12:00:00.000Z");
const chainId = 31337;
const alice = privateKeyToAccount(`0x${"11".repeat(32)}`);
const bob = privateKeyToAccount(`0x${"22".repeat(32)}`);

let admin: Client;
let pool: Pool;
let store: PostgresZhixuRegistryStore;

before(async () => {
  admin = new Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`SET search_path TO ${schema}`);
  await runRegistryMigrations(admin, { now: () => fixedNow });
  pool = new Pool({
    connectionString: testDatabaseUrl,
    options: `-c search_path=${schema}`
  });
  store = new PostgresZhixuRegistryStore({ pool, now: () => fixedNow });
});

after(async () => {
  await pool?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});

describe("zhixu records", () => {
  it("registers and reads a signed zhixu record", async () => {
    const fields = zhixuFields();
    const signature = await signZhixu(fields);

    const record = await store.registerZhixuRecord({ ...fields, signature });

    assert.equal(record.createdAt, fixedNow.toISOString());
    assert.equal(record.signature, signature.toLowerCase());
    assert.deepEqual(await store.getZhixuRecord(recordKey(fields)), record);
    assert.deepEqual(Object.keys(record).sort(), [
      "chainId",
      "createdAt",
      "descriptorHash",
      "descriptorUri",
      "planHash",
      "planId",
      "registeredBy",
      "schemaHash",
      "signature",
      "version"
    ]);
  });

  it("registers records from any wallet (permissionless, no endorsement state)", async () => {
    const aliceFields = zhixuFields({ registeredBy: alice.address.toLowerCase(), descriptorUri: "ipfs://alice" });
    const bobFields = zhixuFields({ registeredBy: bob.address.toLowerCase(), descriptorUri: "ipfs://bob" });

    const aliceRecord = await store.registerZhixuRecord({ ...aliceFields, signature: await signZhixu(aliceFields) });
    const bobRecord = await store.registerZhixuRecord({ ...bobFields, signature: await signZhixu(bobFields, bob) });

    assert.equal(aliceRecord.registeredBy, alice.address.toLowerCase());
    assert.equal(bobRecord.registeredBy, bob.address.toLowerCase());
  });

  it("keeps the plan key open to every publisher instead of letting one wallet squat it", async () => {
    const plan = zhixuFields();
    const competing = zhixuFields({
      planId: plan.planId,
      planHash: plan.planHash,
      registeredBy: bob.address.toLowerCase(),
      descriptorUri: "ipfs://bob-description"
    });

    const first = await store.registerZhixuRecord({ ...plan, signature: await signZhixu(plan) });
    const second = await store.registerZhixuRecord({ ...competing, signature: await signZhixu(competing, bob) });

    assert.equal(first.registeredBy, alice.address.toLowerCase());
    assert.equal(second.registeredBy, bob.address.toLowerCase());
    assert.equal((await store.getZhixuRecord(recordKey(plan)))?.descriptorUri, plan.descriptorUri);
    assert.equal((await store.getZhixuRecord(recordKey(competing)))?.descriptorUri, "ipfs://bob-description");
  });

  it("rejects a descriptor payload above the bounded text length before writing", async () => {
    const fields = zhixuFields({
      descriptorUri: `ipfs://${"a".repeat(REGISTRY_MAX_TEXT_BYTES)}`
    });

    await assert.rejects(
      store.registerZhixuRecord({ ...fields, signature: await signZhixu(fields) }),
      (error: unknown) => error instanceof RegistryValidationError && error.code === "registry_input_invalid"
    );
    assert.equal(await store.getZhixuRecord(recordKey(fields)), undefined);
  });

  it("rejects a signature from a wallet other than registeredBy", async () => {
    const fields = zhixuFields({ registeredBy: alice.address.toLowerCase() });
    const signature = await signZhixu(fields, bob);

    await assert.rejects(
      store.registerZhixuRecord({ ...fields, signature }),
      (error: unknown) => error instanceof RegistrySignatureError && error.code === "registry_signature_invalid"
    );
    assert.equal(await store.getZhixuRecord(recordKey(fields)), undefined);
  });

  it("rejects a record tampered after signing", async () => {
    const fields = zhixuFields();
    const signature = await signZhixu(fields);
    const tampered: ZhixuRecordFields = { ...fields, descriptorUri: "ipfs://tampered" };

    await assert.rejects(
      store.registerZhixuRecord({ ...tampered, signature }),
      (error: unknown) => error instanceof RegistrySignatureError
    );
    assert.equal(await store.getZhixuRecord(recordKey(fields)), undefined);
  });

  it("rejects a duplicate registration and keeps the first record immutable", async () => {
    const fields = zhixuFields();
    const record = await store.registerZhixuRecord({ ...fields, signature: await signZhixu(fields) });
    const conflicting = { ...fields, descriptorUri: "ipfs://later-description" };

    await assert.rejects(
      store.registerZhixuRecord({ ...conflicting, signature: await signZhixu(conflicting) }),
      (error: unknown) => error instanceof RegistryEntryConflictError && error.code === "registry_entry_conflict"
    );
    assert.deepEqual(await store.getZhixuRecord(recordKey(fields)), record);
  });
});

function zhixuFields(overrides: Partial<ZhixuRecordFields> = {}): ZhixuRecordFields {
  return {
    chainId,
    planId: randomPlanId(),
    planHash: randomPlanId(),
    descriptorUri: "ipfs://zhixu-descriptor",
    descriptorHash: `0x${"aa".repeat(32)}`,
    schemaHash: `0x${"bb".repeat(32)}`,
    version: "1.0.0",
    registeredBy: alice.address.toLowerCase(),
    ...overrides
  };
}

function recordKey(fields: ZhixuRecordFields): { readonly chainId: number; readonly planId: string; readonly planHash: string; readonly registeredBy: string } {
  return {
    chainId: fields.chainId,
    planId: fields.planId,
    planHash: fields.planHash,
    registeredBy: fields.registeredBy
  };
}

function randomPlanId(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

async function signZhixu(fields: ZhixuRecordFields, account = alice): Promise<Hex> {
  return await account.signTypedData(buildZhixuRecordTypedData(fields));
}
