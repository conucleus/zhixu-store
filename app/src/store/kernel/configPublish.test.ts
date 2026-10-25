import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishConfig, validateConfigPublish } from "./configPublish";

const PLAN_ID = `0x${"0a".repeat(32)}`;
const PLAN_HASH = `0x${"0b".repeat(32)}`;

function bundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "uvp.order-config/v3",
    configId: "example/flow",
    version: "3.0.0",
    status: "published",
    stages: [{ key: "sourcing", funded: true }],
    ...overrides
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    configId: "example/flow",
    version: "3.0.0",
    planId: PLAN_ID,
    planHash: PLAN_HASH,
    bundle: bundle(),
    ...overrides
  };
}

describe("validateConfigPublish", () => {
  it("accepts a bundle with a paired published plan", () => {
    assert.deepEqual(validateConfigPublish(input()), { ok: true });
  });


  it("requires planId and planHash together", () => {
    const missing = validateConfigPublish(input({ planHash: "not-a-hash" }));
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, "invalid_plan");
    }
  });
});

describe("publishConfig", () => {
  it("posts the config with the store session and returns the server metadata", async () => {
    const calls: { url: string; body?: unknown; session?: string | undefined }[] = [];
    const outcome = await publishConfig(input(), {
      baseUrl: "https://product.test/",
      sessionToken: "session-1",
      fetcher: (async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: JSON.parse(String(init?.body)),
          session: (init?.headers as Record<string, string>)["x-uvp-store-session"]
        });
        return new Response(JSON.stringify({
          configId: "example/flow",
          version: "3.0.0",
          status: "published",
          configHash: `0x${"cc".repeat(32)}`,
          planId: PLAN_ID,
          planHash: PLAN_HASH
        }), { status: 201, headers: { "content-type": "application/json" } });
      }) as typeof fetch
    });
    assert.equal(outcome.kind, "published");
    assert.equal(calls[0]?.url, "https://product.test/product/v3/configs");
    assert.equal(calls[0]?.session, "session-1");
    assert.deepEqual((calls[0]?.body as Record<string, unknown>).planId, PLAN_ID);
    if (outcome.kind === "published") {
      assert.equal(outcome.value.planHash, PLAN_HASH);
    }
  });

  it("surfaces server error codes instead of a fake success", async () => {
    const outcome = await publishConfig(input(), {
      baseUrl: "https://product.test",
      fetcher: (async () => new Response(
        JSON.stringify({ error: "config_publish_forbidden", message: "wallet is not a publisher" }),
        { status: 403, headers: { "content-type": "application/json" } }
      )) as typeof fetch
    });
    assert.equal(outcome.kind, "failed");
    if (outcome.kind === "failed") {
      assert.equal(outcome.status, 403);
      assert.equal(outcome.code, "config_publish_forbidden");
    }
  });
});
