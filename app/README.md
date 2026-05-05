# @uvp-eth/zhixu-store-web

This package is the chain-native UVP order workbench prototype inside the
`uvp-eth` workspace.

Public status: prototype Store/workbench. It is useful for showing the Store
authoring and chain-backed workbench direction, but it is not a public beta or a
production Store launch.

PRD109 is the repo-split convergence gate for Store. Store authoring must own
Product Schema v1, role slots, add-on manifests, selector bindings, resource
requirements, versioning, and review state, while clearly separating docking
sandbox drafts from runtime docked Zhixu local/linked order claims.
Current Store authoring is bundle/manual level: operators can import, compile,
inspect, edit JSON schema bundles, validate, review, version, and request
attestation. A structured schema-authoring workbench is post-split product
backlog, not a blocker for publishing this package as a prototype.

It intentionally does not include the original Store BFF, PostgreSQL schema, or
Go UVP integration. The old copied Store/topology UI and `?legacy=1` entrypoint
were removed from this package; the old external `zhixu-store-web` repository is
not affected.

## Boundary

- Ordinary users should see orders, tasks, evidence, payment conditions,
  disputes, and proof. They should not see protocol words such as signal,
  HookReady, ABI, gas, or registryAddress.
- Source of truth for chain-native UVP state remains EVM contracts and chain
  events.
- `chain-services` provides the first read projections, task projection, proof
  APIs, and Product DTO layer. Evidence storage, notifications, and submission
  relayer UX are later additions.
- Product APIs live in `uvp-eth`; do not import the old Go-coupled Store BFF.

## Backend Alignment

The frontend should eventually talk to an `uvp-eth` product API, backed by:

- `UVPStateMachine` for canonical order/signal/hook state.
- `ZhixuTrustRegistry` for official plan and supplier attestations.
- `chain-services` for projections and relayed submissions.
- an evidence service for off-chain files and hashes.
- an order/task BFF for user-facing drafts, invites, tasks, permissions, and
  simplified page DTOs.

The UI consumes serializable product DTOs from `@uvp-eth/product-dto`. By
default it uses local fallback DTOs from `@uvp-eth/product-dto`; set
`VITE_UVP_CHAIN_SERVICES_URL` to a running `chain-services` API to load:

- `GET /product/zhixus/:zhixuId`
- `GET /product/zhixus`
- `GET /product/orders`
- `GET /product/orders/:orderId`
- `GET /product/tasks`
- `GET /product/me`
- `GET /product/me/tasks`

`VITE_PRODUCT_API_BASE_URL` remains supported as a temporary compatibility alias.
Use `VITE_UVP_CHAIN_SERVICES_URL` for new work.

## Real API and Fallback Behavior

The workbench now calls the PRD 07-09 product API paths through
`src/product/api.ts`:

- drafts: `POST/PATCH/GET /product/order-drafts`
- invites: `POST /product/orders/:draftId/invites`
- participants: `GET /product/orders/:draftId/participants`
- evidence: `POST/GET /product/evidence`
- submission: `POST /product/tasks/:taskId/prepare-submit`,
  `POST /product/tasks/:taskId/submit`, and `GET /product/submissions/:id`

If `VITE_UVP_CHAIN_SERVICES_URL` is not configured, the ordinary Product client
can fall back to an in-browser development mock only when demo mode is
explicitly selected, and the UI shows a “开发样例模式” banner. Business errors
such as validation or permission failures are surfaced as UI errors instead of
being mocked. Store write APIs are stricter: missing API base URLs, `403`,
`404`, `409`, and `422` are displayed as errors and are not silently replaced by
mock writes.

The first version UI exposes loading, empty, error, syncing, wallet-not-connected,
wallet-rejected, submission-pending, confirmed, and failed states. Advanced proof
details stay collapsed until the user opens them.

Mock API clients, mock wallets, mock drafts, and demo Store data are local-only
adapters. They must stay separate from the normal real API path before this
package is described as more than a prototype.

The ordinary-user first screen is `我的待办`. It treats buyer, seller, logistics,
customs, inspection, and validation actors as one participant fulfillment model.
Stablecoin or external funding appears only as a placeholder task plugin; the UI
does not broadcast USDC, escrow, release, refund, custody, or exchange actions.

The Store Console now lives under `src/store/` and is reached through the
`秩序商店` navigation view, separate from the ordinary `订单工作台`. It consumes
`/store/zhixus`, `/store/suppliers`, `/store/runtime/summary`, and the PRD56
`/store/docking-sessions` sandbox routes. Store access can be set locally with
`VITE_UVP_STORE_ACCESS_LEVEL`, `?storeAccess=read|operator|admin`, or
`localStorage.uvp.store.accessLevel`; read-only states hide write controls, and
unauthorized write attempts surface `403`.

The docking page labels every session as “试拼不等于发布”. It can create,
validate, and save sandbox `signalMap` drafts, but it does not publish a formal
Zhixu, register a plan, create an order, or create signal authorization.

## Phase 0 Store Baseline

The Phase 0 Store target is an internal alpha baseline, not a public Store
launch. Registry is the on-chain attestation ledger; Store is the management and
projection layer. Store can organize drafts, versions, supplier metadata, and
operator views, but it cannot create trust or override `ZhixuTrustRegistry` and
`UVPStateMachine` projections.

The baseline expectations are:

- `/store` loads only Store Console surfaces, while `/app` loads only ordinary
  participant order and task surfaces.
- Store fallback is explicit: `/store?storeDemo=1` shows the “Store 开发样例模式”
  banner, and missing API configuration without explicit demo selection is an
  error.
- Store read access hides draft import, docking save/create, and supplier tag
  write controls; direct unauthorized write attempts return `403`.
- Store detail explains lifecycle, plan identity, chain attestation, next
  action, and advanced proof without presenting Store metadata as chain truth.
- Ordinary Product pages continue to avoid protocol jargon such as HookPlan,
  ABI, gas, sourceId, signalId, and registryAddress.

## Phase 1-4 Store Productization

The active Store roadmap is tracked in
`docs/product/prd-73-zhixu-store-productization-roadmap.md`.

- Phase 1 is PRD74: governance publishing closure from imported draft to
  `PlanAttested` projection-backed active version.
- Phase 2 is PRD75 plus PRD77: durable Store operations closure. Local/SQLite
  closure now includes runtime gates, metadata health/degraded reporting,
  route-level restart smoke, explicit write failure behavior, expanded Store
  metadata diagnostics, a staging proof template, and Postgres-gated route
  smoke. The Postgres smoke passed against a local Docker Postgres container on
  2026-04-30. Managed staging Postgres and a curated staging rehearsal record
  are still required before calling it staging-proven.
- Phase 3 is PRD76 plus PRD78/PRD79: operator identity, permissions,
  sensitive-action confirmation, and durable audit. Store session state, named
  capabilities, staging/production dev-header rejection, JWT/JWKS identity,
  durable `StoreAuditStore`, `/store/audit`, backend confirmation, and draft
  attestation UI confirmation are implemented locally. External JWKS/staging
  identity proof and full UI confirmation coverage for future Store actions
  remain follow-up work.
- Phase 4 is PRD80: controlled operator pilot. The first pilot target is Base
  Sepolia chain truth with managed Postgres, private object evidence storage,
  JWT/JWKS Store identity, staging Store-auth preflight checks,
  staging preflight/rehearsal, and curated release evidence.
  `uvp-deploy/deploy/runbooks/store-controlled-operator-pilot.md` owns the
  operator steps; public beta claims remain out of scope.

Across all phases, Store metadata remains operational state. It cannot create
trust, revive a revoked plan or supplier, alter order state, or replace
`ZhixuTrustRegistry` and `UVPStateMachine` projections.

Do not add `/product/flows` back. The product object is a Zhixu order, not a
linear flow.

## Local Commands

```bash
pnpm --filter @uvp-eth/zhixu-store-web dev
pnpm --filter @uvp-eth/zhixu-store-web typecheck
pnpm --filter @uvp-eth/zhixu-store-web build
pnpm --filter @uvp-eth/zhixu-store-web test:e2e
```

`test:e2e` is the PRD 19 phase-1 browser smoke. By default it runs in fixture
mode with local DTO fallback and a mock EIP-1193 wallet; use
`uvp-deploy/deploy/scripts/product-browser-e2e.sh` when you need logs and a run summary
under `logs/product-browser-e2e/<run_id>/`.

PRD 24 adds an explicit full-browser framework:

```bash
uvp-deploy/deploy/scripts/product-browser-e2e.sh --mode fixture
uvp-deploy/deploy/scripts/product-browser-e2e.sh --mode full --require-full
uvp-deploy/deploy/scripts/product-browser-e2e.sh --mode full --require-full --chain-services-url http://127.0.0.1:8787 --store-web-url http://127.0.0.1:4173
```

`--mode full` starts or connects to a real Product stack, runs the Playwright
full spec, and writes `summary.json`, `stack-manifest.json`, API transcript,
service logs, screenshots, traces, and the HTML report under
`logs/product-browser-e2e/<run_id>/`. Without external URLs the runner starts
local Anvil, deploys contracts, starts `chain-services`, and starts
`zhixu-store-web`; with `--chain-services-url` or `--store-web-url` it reuses
those services. `--require-full` fails with a concrete `failedStage` instead of
reporting a skipped full closure when a required API, transaction, indexer, or
service dependency is missing.

PRD 27 closes the full browser negative suite. In local full mode the harness
enables chain-services test-only controls with `UVP_PRODUCT_E2E_FIXTURES=1` and
the frontend with `VITE_UVP_PRODUCT_E2E=1`. The full spec must now report:

```text
7 passed / 0 skipped
```

The runner summary includes `negativeScenarios` for revoked plan, missing
participant, missing evidence, wallet rejected, unauthorized wallet, and
indexer syncing. These controls are local/e2e-only; ordinary deployments should
not expose `/product/e2e/*`.
