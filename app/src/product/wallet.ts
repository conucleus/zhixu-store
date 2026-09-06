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

/** 签名前对 typedData 的预期：与 executor-kit 同一边界（primaryType/domain/submitter 三重校验）。 */
export interface SignTypedDataExpectation {
  /** 协议 primaryType，例如 UVPStateMachineSignal / UVPStateMachineTriggerOrderFromOutside。 */
  readonly primaryType: string;
  /** EIP-712 domain.name 预期值。 */
  readonly domainName: string;
  /** EIP-712 domain.version 预期值；不提供时不比对 version。 */
  readonly domainVersion?: string;
  /** 当前连接并用于签名的钱包地址。 */
  readonly submitter: string;
  /**
   * prepared 记录里声明的 submitter（如 prepared.submitter / humanSummary.submitter）。
   * 全部必须与 typedData.message.submitter 一致，防止换签名对象。
   */
  readonly preparedSubmitters?: readonly (string | undefined)[];
}

export class TypedDataMismatchError extends Error {
  constructor(readonly reason: string) {
    super(`签名内容与当前操作不符，已拒绝签名：${reason}`);
    this.name = "TypedDataMismatchError";
  }
}

export interface WalletConnector {
  readonly target: WalletTarget;
  requestAccount(): Promise<WalletAccount>;
  signTypedData(account: WalletAccount, typedData: unknown, expected: SignTypedDataExpectation): Promise<string>;
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

export async function signTypedData(
  account: WalletAccount,
  typedData: unknown,
  expected: SignTypedDataExpectation
): Promise<string> {
  validateTypedDataForSigning(typedData, expected, account.address);
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

function asAddress(value: unknown): string | undefined {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? value : undefined;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function requireTypedDataRecord(typedData: unknown): Record<string, unknown> {
  if (typeof typedData !== "object" || typedData === null || Array.isArray(typedData)) {
    throw new TypedDataMismatchError("签名对象不是 EIP-712 结构");
  }
  return typedData as Record<string, unknown>;
}

/**
 * 签名前校验 typedData：primaryType、domain（name/version/chainId/verifyingContract）
 * 以及 message.submitter 必须与预期一致，任何篡改都直接拒绝签名。
 * `connectedAddress` 是实际连接的钱包；expectation.submitter 用于交叉确认。
 */
export function validateTypedDataForSigning(
  typedData: unknown,
  expected: SignTypedDataExpectation,
  connectedAddress?: string
): void {
  const record = requireTypedDataRecord(typedData);
  const domain = requireTypedDataRecord(record.domain);
  const message = requireTypedDataRecord(record.message);

  if (record.primaryType !== expected.primaryType) {
    throw new TypedDataMismatchError(`primaryType ${String(record.primaryType)} 与预期 ${expected.primaryType} 不一致`);
  }

  const domainName = domain.name;
  if (domainName !== expected.domainName) {
    throw new TypedDataMismatchError(`domain.name ${String(domainName)} 与预期 ${expected.domainName} 不一致`);
  }
  if (expected.domainVersion !== undefined && domain.version !== expected.domainVersion) {
    throw new TypedDataMismatchError(`domain.version ${String(domain.version)} 与预期 ${expected.domainVersion} 不一致`);
  }
  const chainId = domain.chainId;
  const chainIdNumber = typeof chainId === "number" ? chainId : typeof chainId === "string" ? Number(chainId) : Number.NaN;
  if (!Number.isSafeInteger(chainIdNumber) || chainIdNumber <= 0) {
    throw new TypedDataMismatchError(`domain.chainId ${String(chainId)} 不是有效的链 ID`);
  }
  const verifyingContract = asAddress(domain.verifyingContract);
  if (!verifyingContract) {
    throw new TypedDataMismatchError("domain.verifyingContract 缺失或不是有效地址");
  }

  const messageSubmitter = asAddress(message.submitter);
  if (!messageSubmitter) {
    throw new TypedDataMismatchError("message.submitter 缺失或不是有效地址");
  }
  if (connectedAddress !== undefined && !sameAddress(messageSubmitter, connectedAddress)) {
    throw new TypedDataMismatchError(`message.submitter 与当前连接钱包不一致（${messageSubmitter}）`);
  }
  if (!sameAddress(messageSubmitter, expected.submitter)) {
    throw new TypedDataMismatchError(`message.submitter 与预期提交方不一致（${messageSubmitter}）`);
  }
  for (const preparedSubmitter of expected.preparedSubmitters ?? []) {
    if (preparedSubmitter === undefined) {
      continue;
    }
    if (!sameAddress(messageSubmitter, preparedSubmitter)) {
      throw new TypedDataMismatchError(`message.submitter 与 prepared 记录的提交方不一致（${preparedSubmitter}）`);
    }
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
