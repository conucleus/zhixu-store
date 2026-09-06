import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCT_SUBMIT_DOMAIN_VERSION } from "@uvp-eth/protocol-bindings";
import { signTypedData, TypedDataMismatchError, validateTypedDataForSigning } from "./wallet";

const WALLET = "0xAbC0000000000000000000000000000000000001";

const validSubmitTypedData = {
  domain: {
    name: "UVPStateMachine",
    version: PRODUCT_SUBMIT_DOMAIN_VERSION,
    chainId: 31337,
    verifyingContract: "0x0000000000000000000000000000000000000001"
  },
  types: { UVPStateMachineSignal: [] },
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

  it("refuses to sign tampered data before ever touching the wallet", async () => {
    // window.ethereum 未定义：如果校验被绕过，错误会是 wallet_not_connected 而不是 mismatch。
    await assert.rejects(
      signTypedData({ address: WALLET }, { ...validSubmitTypedData, primaryType: "Tampered" }, submitExpectation),
      (error: unknown) => error instanceof TypedDataMismatchError
    );
  });

  it("validates trigger-order typed data against its own expectation", () => {
    const triggerTypedData = {
      domain: validSubmitTypedData.domain,
      types: { UVPStateMachineTriggerOrderFromOutside: [] },
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
