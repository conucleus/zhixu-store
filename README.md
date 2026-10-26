# zhixu-store

Store operator product boundary; being narrowed to the `zhixu-registry` data
layer (ARCHITECTURE.md Phase C). The registry is the target non-user-facing
component; the Store console app remains temporarily while consumers migrate.

This domain is for the nucleus/operator side of UVP: designing, organizing,
maintaining, and running Zhixu orders through chain-backed Product DTOs.

Scope, staged goals, and anti-drift boundaries for this repository are defined
in [STORE-CHARTER.md](./STORE-CHARTER.md). Agent orientation and debugging
boundaries are in [AGENTS.md](./AGENTS.md). New features must be classified
against the charter before implementation.

- `registry/`: `@uvp-eth/zhixu-registry` — permissionless data layer for
  `ZhixuRecord` descriptor registration and wallet `IdentityClaim` records.
  Library only (no UI/HTTP): EIP-712 `UVPZhixuRegistry/1`, signature check on
  write, append-only Postgres store + migrations, opaque attestation refs. No
  approval, status, curation, recommendation, or KYC fields. See
  [registry/README.md](./registry/README.md).
- `app/`: current Store operator console frontend (temporary; slated for
  removal as Phase C completes). Source layout is organized
  by user task (`src/app`, `src/lib`, `src/store`, `src/styles`); `src/shared` is
  the frontend-shared submodule mount (single source for the chain track,
  consumed via `chain/`, `contracts/`, `domain/`). The participant workbench
  source that used to live in `src/product` has been removed; participant
  flows (orders, tasks, evidence, submission) are owned by `uvp-order-app`.
  See [app/README.md](./app/README.md) for the directory map and migration gaps.

## Development Topology

This repository is mounted by `uvp-eth` as a Git submodule. The app depends on
`@uvp-eth/product-dto`, which is owned by `uvp-protocol`.

Use the `uvp-eth` umbrella checkout for local integration development so pnpm can
resolve that cross-repository `workspace:*` dependency. A standalone checkout
requires `@uvp-eth/product-dto` to be published or linked into an equivalent
local workspace.

The Store consumes Product API projections. It must not treat local metadata,
frontend fallback data, or cached API responses as chain authority.

Store keeps Product Schema v1 authoring, selector bindings, resource
requirements, docking drafts, versioning, and review state aligned with the
frozen `@uvp-eth/product-dto` convergence surfaces.
