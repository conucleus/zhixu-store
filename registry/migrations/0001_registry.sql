-- Zhixu registry storage: append-only descriptor records and wallet identity claims.

CREATE TABLE IF NOT EXISTS zhixu_registry_zhixu_records (
  chain_id BIGINT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  descriptor_uri TEXT,
  descriptor_hash TEXT,
  schema_hash TEXT,
  version TEXT,
  registered_by TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chain_id, plan_id, plan_hash)
);

CREATE TABLE IF NOT EXISTS zhixu_registry_identity_claims (
  chain_id BIGINT NOT NULL,
  wallet TEXT NOT NULL,
  subject TEXT NOT NULL,
  descriptor_uri TEXT,
  descriptor_hash TEXT,
  signature TEXT NOT NULL,
  attestation_refs TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chain_id, wallet, subject)
);
