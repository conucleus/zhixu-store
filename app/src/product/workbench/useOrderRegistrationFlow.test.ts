import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PreparedOrderTriggerDTO, ProductApiClient, ProductOrderDraftDTO } from "../api";
import type { ActionState } from "./workbenchTypes";
import { executeOrderRegistration } from "./useOrderRegistrationFlow";

const draft: ProductOrderDraftDTO = {
  draftId: "draft-1",
  zhixuId: "zhixu-a",
  planId: "plan-1",
  planHash: "0xplan",
  title: "切换目录测试订单",
  businessType: "工业设备",
  totalAmount: "100",
  currency: "USDC",
  status: "ready_to_trigger",
  createdBy: "0xabc0000000000000000000000000000000000001",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const account = { address: "0xabc0000000000000000000000000000000000001" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

function preparedTrigger(): PreparedOrderTriggerDTO {
  return {
    prepareId: "prepare-1",
    triggerId: "trigger-1",
    draftId: draft.draftId,
    orderId: "order-1",
    expiresAt: "2026-09-02T00:00:00.000Z",
    submitter: account.address,
    stateMachineAddress: "0x0000000000000000000000000000000000000001",
    // 签名域与 prepare 记录声明的部署地址一致（启动链路签名前交叉核对）。
    typedData: { domain: { name: "UVPStateMachine", verifyingContract: "0x0000000000000000000000000000000000000001" } }
  };
}

/** 手动放行的 deferred API：resolve 顺序完全由测试控制（模拟慢网）。 */
function deferredApi(): {
  readonly api: ProductApiClient;
  readonly resolvePrepare: (prepared: PreparedOrderTriggerDTO) => void;
  readonly rejectPrepare: (error: Error) => void;
  readonly resolveTrigger: (next: ProductOrderDraftDTO) => void;
} {
  let settlePrepare!: (value: { data: PreparedOrderTriggerDTO; source: { kind: "real"; baseUrl: string } }) => void;
  let failPrepare!: (error: Error) => void;
  let resolveTrigger!: (value: { data: ProductOrderDraftDTO; source: { kind: "real"; baseUrl: string } }) => void;
  const api = {
    prepareOrderTrigger: () =>
      new Promise<{ data: PreparedOrderTriggerDTO; source: { kind: "real"; baseUrl: string } }>((resolve, reject) => {
        settlePrepare = resolve;
        failPrepare = reject;
      }),
    triggerOrder: () =>
      new Promise<{ data: ProductOrderDraftDTO; source: { kind: "real"; baseUrl: string } }>((resolve) => {
        resolveTrigger = resolve;
      })
  } as unknown as ProductApiClient;
  const wrap = { kind: "real" as const, baseUrl: "https://api.test" };
  return {
    api,
    resolvePrepare: (prepared) => settlePrepare({ data: prepared, source: wrap }),
    rejectPrepare: (error) => failPrepare(error),
    resolveTrigger: (next) => resolveTrigger({ data: next, source: wrap })
  };
}

function harness() {
  const deferred = deferredApi();
  const actions: ActionState[] = [];
  const registered: ProductOrderDraftDTO[] = [];
  let stale = false;
  const start = () => executeOrderRegistration({
    api: deferred.api,
    ensureDraft: async () => draft,
    onRegistered: (next) => registered.push(next),
    setAction: (action) => actions.push(action),
    // 目录切换由测试翻转 stale 标志模拟（scopeRef !== requestScope）。
    isStale: () => stale,
    requestAccount: async () => account,
    sign: async () => "0xsig",
    // 测试环境没有部署配置注入：签名域预期用桩（fail-closed 语义本身
    // 在 workbenchSupport.test.ts 单测覆盖）。
    signExpectation: () => ({ verifyingContract: "0x0000000000000000000000000000000000000001" })
  });
  return { deferred, actions, registered, markStale: () => { stale = true; }, start };
}

describe("order registration scope guard", () => {
  it("applies the triggered draft when the catalog scope is unchanged", async () => {
    const h = harness();
    const pending = h.start();
    await tick();
    h.deferred.resolvePrepare(preparedTrigger());
    await tick();
    h.deferred.resolveTrigger({ ...draft, status: "triggered", triggeredOrderId: "order-1" });
    await pending;

    assert.deepEqual(h.registered.map((item) => item.draftId), ["draft-1"]);
    assert.equal(h.actions.at(-1)?.phase, "success");
  });

  it("drops the trigger result when the catalog is switched while the request is in flight", async () => {
    // 切换目录会清空草稿：旧草稿的启动结果不得写进新选中 DTO 的界面。
    const h = harness();
    const pending = h.start();
    await tick();
    h.deferred.resolvePrepare(preparedTrigger());
    await tick();
    h.markStale();
    h.deferred.resolveTrigger({ ...draft, status: "triggered", triggeredOrderId: "order-1" });
    await pending;

    assert.deepEqual(h.registered, []);
    assert.equal(h.actions.some((action) => action.phase === "success"), false);
  });

  it("drops the error copy too when the scope switched before failure", async () => {
    const h = harness();
    const pending = h.start();
    await tick();
    h.markStale();
    h.deferred.rejectPrepare(new Error("network_down"));
    await pending;

    // 旧作用域的错误不带入新目录视图（错误动作也被丢弃）。
    assert.equal(h.actions.some((action) => action.phase === "error"), false);
  });
});

describe("order registration signing gates", () => {
  /** 记录签名调用的 deferred 桩：核对门失败时签名必须一次都没被调用。 */
  function recordingHarness(): {
    readonly deferred: ReturnType<typeof deferredApi>;
    readonly signed: unknown[];
    readonly actions: ActionState[];
    readonly start: () => Promise<void>;
  } {
    const deferred = deferredApi();
    const actions: ActionState[] = [];
    const signed: unknown[] = [];
    const start = () => executeOrderRegistration({
      api: deferred.api,
      ensureDraft: async () => draft,
      onRegistered: () => undefined,
      setAction: (action) => actions.push(action),
      isStale: () => false,
      requestAccount: async () => account,
      sign: async (_account, typedData) => {
        signed.push(typedData);
        return "0xsig";
      },
      signExpectation: () => ({ verifyingContract: "0x0000000000000000000000000000000000000001" })
    });
    return { deferred, signed, actions, start };
  }

  it("refuses to sign when the typed-data domain disagrees with the prepared record's state machine address", async () => {
    // 被攻陷 BFF 单独换签名域（prepare 记录的 stateMachineAddress 不变）：
    // 交叉核对在调钱包前拒绝，签名与 trigger 都不发生。
    const h = recordingHarness();
    const pending = h.start();
    await tick();
    const forgedDomain: PreparedOrderTriggerDTO = {
      ...preparedTrigger(),
      typedData: { domain: { name: "UVPStateMachine", verifyingContract: "0x000000000000000000000000000000000000dead" } }
    };
    h.deferred.resolvePrepare(forgedDomain);
    await pending;

    assert.deepEqual(h.signed, []);
    const failure = h.actions.at(-1);
    assert.equal(failure?.phase, "error");
    assert.match(failure?.message ?? "", /状态机部署地址不一致/u);
  });

  it("signs after the cross-check when the prepared record and domain agree (case-insensitive)", async () => {
    const h = recordingHarness();
    const pending = h.start();
    await tick();
    const prepared: PreparedOrderTriggerDTO = {
      ...preparedTrigger(),
      typedData: { domain: { name: "UVPStateMachine", verifyingContract: "0X0000000000000000000000000000000000000001" } }
    };
    h.deferred.resolvePrepare(prepared);
    await tick();
    h.deferred.resolveTrigger({ ...draft, status: "triggered", triggeredOrderId: "order-1" });
    await pending;

    assert.equal(h.signed.length, 1);
  });
});
