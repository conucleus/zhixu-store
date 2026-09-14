import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCT_SUBMIT_DOMAIN_VERSION } from "@uvp-eth/protocol-bindings";
import { requestWalletAccount, signTypedData, TypedDataMismatchError, validateTypedDataForSigning, WalletRejectedError } from "./wallet";

const WALLET = "0xAbC0000000000000000000000000000000000001";

const validSubmitTypedData = {
  domain: {
    name: "UVPStateMachine",
    version: PRODUCT_SUBMIT_DOMAIN_VERSION,
    chainId: 31337,
    verifyingContract: "0x0000000000000000000000000000000000000001"
  },
  // 单源签名闸门要求 types[primaryType] 是非空字段表：部分钱包/中转层会
  // 剥离字段定义，测试夹具必须携带真实字段表才能代表可签信封。
  types: { UVPStateMachineSignal: [{ name: "submitter", type: "address" }] },
  primaryType: "UVPStateMachineSignal",
  message: {
    submitter: WALLET
  }
};

const submitExpectation = {
  primaryType: "UVPStateMachineSignal",
  domainName: "UVPStateMachine",
  domainVersion: PRODUCT_SUBMIT_DOMAIN_VERSION,
  submitter: WALLET
} as const;

function expectMismatch(action: () => void, fragment: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof TypedDataMismatchError, `expected TypedDataMismatchError, got ${String(error)}`);
    assert.match(error.message, new RegExp(fragment, "u"));
    return true;
  });
}

describe("pre-signature typed data validation", () => {
  it("accepts typed data that matches the expectation", () => {
    validateTypedDataForSigning(validSubmitTypedData, submitExpectation, WALLET);
  });

  it("accepts checksum-address and lowercase submitter mixtures", () => {
    validateTypedDataForSigning(
      { ...validSubmitTypedData, message: { submitter: WALLET.toLowerCase() } },
      submitExpectation,
      WALLET.toLowerCase()
    );
  });

  it("rejects a tampered primaryType", () => {
    expectMismatch(
      () => validateTypedDataForSigning(
        { ...validSubmitTypedData, primaryType: "UVPStateMachinePlanCommit" },
        submitExpectation,
        WALLET
      ),
      "primaryType"
    );
  });

  it("rejects a tampered domain.name", () => {
    expectMismatch(
      () => validateTypedDataForSigning(
        { ...validSubmitTypedData, domain: { ...validSubmitTypedData.domain, name: "EvilDomain" } },
        submitExpectation,
        WALLET
      ),
      "domain.name"
    );
  });

  it("rejects a tampered domain.version", () => {
    expectMismatch(
      () => validateTypedDataForSigning(
        { ...validSubmitTypedData, domain: { ...validSubmitTypedData.domain, version: "9.9" } },
        submitExpectation,
        WALLET
      ),
      "domain.version"
    );
  });

  it("rejects an invalid domain.chainId", () => {
    for (const chainId of [0, -1, "abc", undefined]) {
      expectMismatch(
        () => validateTypedDataForSigning(
          { ...validSubmitTypedData, domain: { ...validSubmitTypedData.domain, chainId } },
          submitExpectation,
          WALLET
        ),
        "chainId"
      );
    }
  });

  it("rejects a missing or malformed verifyingContract", () => {
    for (const verifyingContract of [undefined, "0x1234", "not-an-address"]) {
      expectMismatch(
        () => validateTypedDataForSigning(
          { ...validSubmitTypedData, domain: { ...validSubmitTypedData.domain, verifyingContract } },
          submitExpectation,
          WALLET
        ),
        "verifyingContract"
      );
    }
  });

  it("rejects a domain.chainId that differs from the expected deployment chain", () => {
    expectMismatch(
      () => validateTypedDataForSigning(validSubmitTypedData, {
        ...submitExpectation,
        chainId: 1
      }, WALLET),
      "domain.chainId 31337 与预期 1"
    );
    // 期望一致时通过。
    validateTypedDataForSigning(validSubmitTypedData, { ...submitExpectation, chainId: 31337 }, WALLET);
  });

  it("rejects a domain.verifyingContract that differs from the expected state machine address", () => {
    expectMismatch(
      () => validateTypedDataForSigning(validSubmitTypedData, {
        ...submitExpectation,
        verifyingContract: "0x0000000000000000000000000000000000000002"
      }, WALLET),
      "domain.verifyingContract 0x0000000000000000000000000000000000000001 与预期 0x0000000000000000000000000000000000000002"
    );
    // 地址十六进制大小写差异不算不一致。
    validateTypedDataForSigning(
      {
        ...validSubmitTypedData,
        domain: { ...validSubmitTypedData.domain, verifyingContract: "0x00000000000000000000000000000000000000AB" }
      },
      { ...submitExpectation, verifyingContract: "0x00000000000000000000000000000000000000ab" },
      WALLET
    );
  });

  it("rejects when message.submitter differs from the connected wallet", () => {
    expectMismatch(
      () => validateTypedDataForSigning(
        { ...validSubmitTypedData, message: { submitter: "0x0000000000000000000000000000000000000099" } },
        submitExpectation,
        WALLET
      ),
      "message.submitter"
    );
  });

  it("rejects when message.submitter is missing or not an address", () => {
    for (const submitter of [undefined, "", "0x99"]) {
      expectMismatch(
        () => validateTypedDataForSigning(
          { ...validSubmitTypedData, message: { submitter } },
          submitExpectation,
          WALLET
        ),
        "message.submitter"
      );
    }
  });

  it("rejects when the prepared record declares a different submitter", () => {
    expectMismatch(
      () => validateTypedDataForSigning(validSubmitTypedData, {
        ...submitExpectation,
        preparedSubmitters: ["0x0000000000000000000000000000000000000777"]
      }, WALLET),
      "prepared"
    );
  });

  it("rejects a non-EIP-712 payload", () => {
    for (const payload of [undefined, null, "string", 42, {}, { primaryType: "X" }]) {
      expectMismatch(
        () => validateTypedDataForSigning(payload, submitExpectation, WALLET),
        "EIP-712|primaryType"
      );
    }
  });

  it("rejects a typed data envelope whose primary type field table is missing or empty", () => {
    // 部分钱包/中转层会改写 types：字段表被剥离的信封在调钱包前拒绝
    // （单源签名闸门新增的并集校验面）。
    for (const types of [undefined, {}, { UVPStateMachineSignal: [] }]) {
      expectMismatch(
        () => validateTypedDataForSigning({ ...validSubmitTypedData, types }, submitExpectation, WALLET),
        "types\\[UVPStateMachineSignal\\]"
      );
    }
  });

  it("refuses to sign tampered data before ever touching the wallet", async () => {
    // window.ethereum 未定义：如果校验被绕过，错误会是 wallet_not_connected 而不是 mismatch。
    await assert.rejects(
      signTypedData({ address: WALLET }, { ...validSubmitTypedData, primaryType: "Tampered" }, submitExpectation),
      (error: unknown) => error instanceof TypedDataMismatchError
    );
  });

  it("checks the wallet's current chain against domain.chainId before signing", async () => {
    const requests: string[] = [];
    (globalThis as { window?: unknown }).window = {
      ethereum: {
        request: async (args: { readonly method: string }): Promise<unknown> => {
          requests.push(args.method);
          if (args.method === "eth_chainId") {
            return "0x7a69";
          }
          if (args.method === "eth_signTypedData_v4") {
            return "0xstub-signature";
          }
          throw new Error(`unsupported method ${args.method}`);
        }
      }
    };
    try {
      // 31337 = 0x7a69：当前链与域一致才放行。
      const signature = await signTypedData({ address: WALLET }, validSubmitTypedData, submitExpectation);
      assert.equal(signature, "0xstub-signature");
      assert.deepEqual(requests, ["eth_chainId", "eth_signTypedData_v4"]);

      await assert.rejects(
        signTypedData({ address: WALLET }, {
          ...validSubmitTypedData,
          domain: { ...validSubmitTypedData.domain, chainId: 1 }
        }, submitExpectation),
        (error: unknown) => error instanceof TypedDataMismatchError && error.message.includes("与签名域 chainId 1 不一致")
      );
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("validates trigger-order typed data against its own expectation", () => {
    const triggerTypedData = {
      domain: validSubmitTypedData.domain,
      types: { UVPStateMachineTriggerOrderFromOutside: [{ name: "submitter", type: "address" }] },
      primaryType: "UVPStateMachineTriggerOrderFromOutside",
      message: { submitter: WALLET }
    };
    validateTypedDataForSigning(triggerTypedData, {
      primaryType: "UVPStateMachineTriggerOrderFromOutside",
      domainName: "UVPStateMachine",
      domainVersion: PRODUCT_SUBMIT_DOMAIN_VERSION,
      submitter: WALLET,
      preparedSubmitters: [WALLET]
    }, WALLET);

    expectMismatch(
      () => validateTypedDataForSigning(triggerTypedData, submitExpectation, WALLET),
      "primaryType"
    );
  });
});

describe("wallet rejection detection", () => {
  async function requestAccountError(requestError: unknown): Promise<unknown> {
    (globalThis as { window?: unknown }).window = {
      ethereum: {
        request: async (): Promise<unknown> => {
          throw requestError;
        }
      }
    };
    try {
      await requestWalletAccount();
      return undefined;
    } catch (error) {
      return error;
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  }

  it("maps provider code 4001 to WalletRejectedError", async () => {
    assert.ok(await requestAccountError({ code: 4001 }) instanceof WalletRejectedError);
  });

  it("maps wallet rejection phrasings beyond the literal word reject", async () => {
    for (const message of [
      "User denied transaction.",
      "User denied message signature",
      "User cancelled the request.",
      "Request canceled by user"
    ]) {
      const error = await requestAccountError(new Error(message));
      assert.ok(
        error instanceof WalletRejectedError,
        `expected WalletRejectedError for ${JSON.stringify(message)}, got ${String(error)}`
      );
    }
  });

  it("passes non-rejection failures through untouched", async () => {
    for (const message of ["Network unreachable", "signature failed", "internal error"]) {
      const error = await requestAccountError(new Error(message));
      assert.ok(
        !(error instanceof WalletRejectedError),
        `expected a plain failure for ${JSON.stringify(message)}, got WalletRejectedError`
      );
    }
  });
});
