export interface WalletAccount {
  readonly address: string;
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
  requestAccount(): Promise<WalletAccount>;
  signTypedData(account: WalletAccount, typedData: unknown): Promise<string>;
}

interface BrowserEthereum {
  request(args: { readonly method: string; readonly params?: unknown[] }): Promise<unknown>;
}

type WindowWithEthereum = Window & {
  readonly ethereum?: BrowserEthereum;
};

export async function requestWalletAccount(): Promise<WalletAccount> {
  const ethereum = (window as WindowWithEthereum).ethereum;
  if (!ethereum) {
    throw new WalletNotConnectedError();
  }

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : undefined;
    if (!address) {
      throw new WalletNotConnectedError();
    }
    return { address };
  } catch (error) {
    if (isRejected(error)) {
      throw new WalletRejectedError();
    }
    throw error;
  }
}

export async function signTypedData(account: WalletAccount, typedData: unknown): Promise<string> {
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
