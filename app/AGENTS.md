# AGENTS.md

## Module Purpose

`zhixu-store/app/` is the frontend-only Product workbench and Store Console
prototype for the EVM/Web3 UVP track.

## Boundaries

- Keep ordinary user order/task/evidence flows separate from Store operator
  surfaces.
- Put new Store surfaces under `src/store/`; do not keep growing
  `ProductWorkbenchApp.tsx` with Store console pages.
- Store pages may show operational terms for nuclei, but ordinary order pages
  should avoid HookPlan, ABI, gas, sourceId, signalId, and trust-domain jargon.
- Store write controls must fail closed. Hide them for read-only access, and
  surface `403` instead of mocking write success.
- Explicit demo banners must remain visible when local demo data is used.
- Do not add ops-console recovery controls, payment-provider behavior, custody,
  exchange, or settlement-rail actions to this frontend.

## Store Docking Sandbox

- Docking sessions are "试拼" drafts only.
- Creating, validating, or saving a docking draft must not publish a Zhixu,
  register a plan, create an order, or create order-level signal authorization.
- The UI must clearly label sandbox results as not published.
