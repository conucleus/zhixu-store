-- Zhixu registry storage: append-only content-addressed descriptor records.

CREATE TABLE IF NOT EXISTS zhixu_registry_zhixu_records (
  chain_id BIGINT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  descriptor_uri TEXT CHECK (descriptor_uri IS NULL OR octet_length(descriptor_uri) <= 2048),
  descriptor_hash TEXT CHECK (descriptor_hash IS NULL OR octet_length(descriptor_hash) <= 2048),
  schema_hash TEXT CHECK (schema_hash IS NULL OR octet_length(schema_hash) <= 2048),
  version TEXT CHECK (version IS NULL OR octet_length(version) <= 2048),
  registered_by TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chain_id, plan_id, plan_hash, registered_by)
);
