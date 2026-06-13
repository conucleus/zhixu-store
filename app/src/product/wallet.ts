export interface WalletAccount {
  readonly address: string;
  readonly source: "browser" | "mock";
}

export type WalletTarget = "evm" | "solana";

export class WalletNotConnectedError extends Error {
  constructor() {
    super("wallet_not_connected");
    this.name = "WalletNotConnectedError";
  }
}

export class WalletRejectedError extends Error {
  constructor() {
    super("wallet_rejected");
    this.name = "WalletRejectedError";
  }
}

export class UnsupportedWalletTargetError extends Error {
  constructor(readonly target: WalletTarget) {
    super(`${target} wallet connector is reserved but not implemented`);
    this.name = "UnsupportedWalletTargetError";
  }
}

export interface WalletConnector {
  readonly target: WalletTarget;
  requestAccount(allowMock: boolean): Promise<WalletAccount>;
  signTypedData(
    account: WalletAccount,
    typedData: unknown,
    options: { readonly allowMock: boolean; readonly reject?: boolean | undefined }
  ): Promise<string>;
}

interface BrowserEthereum {
  request(args: { readonly method: string; readonly params?: unknown[] }): Promise<unknown>;
}

type WindowWithEthereum = Window & {
  readonly ethereum?: BrowserEthereum;
};

const mockWalletAddress = "0x1111111111111111111111111111111111111111";

export async function requestWalletAccount(allowMock: boolean): Promise<WalletAccount> {
  const ethereum = (window as WindowWithEthereum).ethereum;
  if (!ethereum) {
    if (allowMock) {
      await delay(300);
      return { address: mockWalletAddress, source: "mock" };
    }
    throw new WalletNotConnectedError();
  }

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : undefined;
    if (!address) {
      throw new WalletNotConnectedError();
    }
    return { address, source: "browser" };
  } catch (error) {
    if (isRejected(error)) {
      throw new WalletRejectedError();
    }
    throw error;
  }
}

export async function signTypedData(
  account: WalletAccount,
  typedData: unknown,
  options: { readonly allowMock: boolean; readonly reject?: boolean | undefined }
): Promise<string> {
  if (options.reject) {
    throw new WalletRejectedError();
  }
  if (account.source === "mock") {
    if (!options.allowMock) {
      throw new WalletNotConnectedError();
    }
    await delay(500);
    return `0xmock${stableToken(JSON.stringify(typedData)).padEnd(124, "0")}`;
  }

  const ethereum = (window as WindowWithEthereum).ethereum;
  if (!ethereum) {
    throw new WalletNotConnectedError();
  }
  try {
    const signature = await ethereum.request({
      method: "eth_signTypedData_v4",
      params: [account.address, JSON.stringify(typedData)]
    });
    if (typeof signature !== "string") {
      throw new Error("wallet_signature_missing");
    }
    return signature;
  } catch (error) {
    if (isRejected(error)) {
      throw new WalletRejectedError();
    }
    throw error;
  }
}

export const evmWalletConnector: WalletConnector = {
  target: "evm",
  requestAccount: requestWalletAccount,
  signTypedData
};

export function getWalletConnector(target: WalletTarget = "evm"): WalletConnector {
  switch (target) {
    case "evm":
      return evmWalletConnector;
    case "solana":
      throw new UnsupportedWalletTargetError("solana");
  }
}

function isRejected(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const maybeError = error as { readonly code?: unknown; readonly message?: unknown };
  return maybeError.code === 4001 ||
    (typeof maybeError.message === "string" && maybeError.message.toLowerCase().includes("reject"));
}

function stableToken(seed: string): string {
  let state = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    state = Math.imul(state, 33) ^ seed.charCodeAt(index);
  }
  return (state >>> 0).toString(16);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
