// Registry behavior: signed permissionless registration, immutable duplicates, opaque attestations.

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
  runRegistryMigrations,
  type IdentityClaimDraft,
  type ZhixuRecordFields
} from "@uvp-eth/zhixu-registry";
import {
  buildIdentityClaimTypedData,
  buildZhixuRecordTypedData
} from "@uvp-eth/protocol-bindings";

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
  });

  it("registers from any wallet and exposes no approval, status, curation, or KYC fields", async () => {
    const aliceFields = zhixuFields({ registeredBy: alice.address.toLowerCase(), descriptorUri: "ipfs://alice" });
    const bobFields = zhixuFields({ registeredBy: bob.address.toLowerCase(), descriptorUri: "ipfs://bob" });

    const aliceRecord = await store.registerZhixuRecord({ ...aliceFields, signature: await signZhixu(aliceFields) });
    const bobRecord = await store.registerZhixuRecord({ ...bobFields, signature: await signZhixu(bobFields, bob) });

    assert.equal(aliceRecord.registeredBy, alice.address.toLowerCase());
    assert.equal(bobRecord.registeredBy, bob.address.toLowerCase());
    assert.deepEqual(Object.keys(aliceRecord).sort(), [
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

describe("identity claims", () => {
  it("registers and reads a claim with opaque attestation refs", async () => {
    const claim = identityClaim({
      attestationRefs: ["ipfs://attestation-1", "https://attestations.example/vc/2"]
    });
    const signature = await signClaim(claim);

    const record = await store.registerIdentityClaim({ ...claim, signature });

    assert.equal(record.createdAt, fixedNow.toISOString());
    assert.deepEqual(record.attestationRefs, claim.attestationRefs);
    assert.deepEqual(await store.getIdentityClaim(claimKey(claim)), record);
    assert.deepEqual(Object.keys(record).sort(), [
      "attestationRefs",
      "chainId",
      "createdAt",
      "descriptorHash",
      "descriptorUri",
      "signature",
      "subject",
      "wallet"
    ]);
  });

  it("allows any wallet and different subjects for the same wallet", async () => {
    const aliceClaim = identityClaim({ wallet: alice.address.toLowerCase(), subject: "did:example:alice" });
    const bobClaim = identityClaim({ wallet: bob.address.toLowerCase(), subject: "did:example:bob" });
    const aliceSecondSubject = identityClaim({ wallet: alice.address.toLowerCase(), subject: "org:example:alice" });

    const [aliceRecord, bobRecord, aliceSecondRecord] = await Promise.all([
      store.registerIdentityClaim({ ...aliceClaim, signature: await signClaim(aliceClaim) }),
      store.registerIdentityClaim({ ...bobClaim, signature: await signClaim(bobClaim, bob) }),
      store.registerIdentityClaim({ ...aliceSecondSubject, signature: await signClaim(aliceSecondSubject) })
    ]);

    assert.equal(aliceRecord.wallet, alice.address.toLowerCase());
    assert.equal(bobRecord.wallet, bob.address.toLowerCase());
    assert.equal(aliceSecondRecord.subject, "org:example:alice");
  });

  it("rejects a claim signed by a different wallet", async () => {
    const claim = identityClaim({ wallet: alice.address.toLowerCase() });
    const signature = await signClaim(claim, bob);

    await assert.rejects(
      store.registerIdentityClaim({ ...claim, signature }),
      (error: unknown) => error instanceof RegistrySignatureError && error.code === "registry_signature_invalid"
    );
    assert.equal(await store.getIdentityClaim(claimKey(claim)), undefined);
  });

  it("rejects a duplicate claim and keeps the first claim immutable", async () => {
    const claim = identityClaim({ descriptorUri: "ipfs://claims-alice" });
    const record = await store.registerIdentityClaim({ ...claim, signature: await signClaim(claim) });
    const conflicting = { ...claim, descriptorUri: "ipfs://claims-alice-later" };

    await assert.rejects(
      store.registerIdentityClaim({ ...conflicting, signature: await signClaim(conflicting) }),
      (error: unknown) => error instanceof RegistryEntryConflictError && error.code === "registry_entry_conflict"
    );
    assert.deepEqual(await store.getIdentityClaim(claimKey(claim)), record);
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

function identityClaim(overrides: Partial<IdentityClaimDraft> = {}): IdentityClaimDraft {
  return {
    chainId,
    wallet: alice.address.toLowerCase(),
    subject: `did:example:${randomBytes(8).toString("hex")}`,
    descriptorUri: "ipfs://identity-claim",
    descriptorHash: `0x${"cc".repeat(32)}`,
    attestationRefs: [],
    ...overrides
  };
}

function recordKey(fields: ZhixuRecordFields): { readonly chainId: number; readonly planId: string; readonly planHash: string } {
  return { chainId: fields.chainId, planId: fields.planId, planHash: fields.planHash };
}

function claimKey(claim: IdentityClaimDraft): { readonly chainId: number; readonly wallet: string; readonly subject: string } {
  return { chainId: claim.chainId, wallet: claim.wallet, subject: claim.subject };
}

function randomPlanId(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

async function signZhixu(fields: ZhixuRecordFields, account = alice): Promise<Hex> {
  return await account.signTypedData(buildZhixuRecordTypedData(fields));
}

async function signClaim(claim: IdentityClaimDraft, account = alice): Promise<Hex> {
  return await account.signTypedData(buildIdentityClaimTypedData(claim));
}
