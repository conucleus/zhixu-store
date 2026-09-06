# zhixu-store

Store and workbench product boundary.

This domain is for the nucleus/operator side of UVP: designing, organizing,
maintaining, and running Zhixu orders through chain-backed Product DTOs.

Scope, staged goals, and anti-drift boundaries for this repository are defined
in [STORE-CHARTER.md](./STORE-CHARTER.md). Agent orientation and debugging
boundaries are in [AGENTS.md](./AGENTS.md). New features must be classified
against the charter before implementation.

- `app/`: current Store and order workbench frontend.

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
