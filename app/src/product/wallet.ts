import {
  isUserRejectedRequestError,
  validateTypedDataForSigning as validateTypedDataEnvelope,
  type TypedDataSigningExpectation,
  type TypedDataSigningMismatchReason
} from "@uvp-eth/protocol-bindings";

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

/**
 * 签名前对 typedData 的预期：形状与判定语义以 protocol-bindings 的
 * TypedDataSigningExpectation 为单源（primaryType + types 字段表、domain
 * 四要素、submitter 与 preparedSubmitters/connectedAddress 交叉核对的
 * 三端并集），本端只保留宿主别名供既有调用点使用。
 */
export type SignTypedDataExpectation = TypedDataSigningExpectation;

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
    if (isUserRejectedRequestError(error)) {
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
  // 域校验不只看格式：签名前至少核对钱包当前连接的链与 domain.chainId 一致，
  // 否则被攻陷的 BFF 可以让参与者把"确认"签到另一条链的无效域上。
  const domainChainId = parseDomainChainId(requireTypedDataRecord(typedData).domain);
  const walletChainIdHex = await ethereum.request({ method: "eth_chainId" });
  const walletChainId = typeof walletChainIdHex === "string"
    ? Number.parseInt(walletChainIdHex, 16)
    : Number.NaN;
  if (walletChainId !== domainChainId) {
    throw new TypedDataMismatchError(
      `钱包当前连接链 ${Number.isNaN(walletChainId) ? String(walletChainIdHex) : walletChainId} 与签名域 chainId ${domainChainId} 不一致，请切换到部署链后再签名`
    );
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
    if (isUserRejectedRequestError(error)) {
      throw new WalletRejectedError();
    }
    throw error;
  }
}

/** EIP-712 domain.chainId 可能以 number 或十进制字符串到达；解析失败返回 undefined。 */
function parseChainId(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDomainChainId(domainValue: unknown): number {
  const chainId = requireTypedDataRecord(domainValue).chainId;
  const parsed = parseChainId(chainId);
  if (parsed === undefined) {
    throw new TypedDataMismatchError(`domain.chainId ${String(chainId)} 不是有效的链 ID`);
  }
  return parsed;
}

function requireTypedDataRecord(typedData: unknown): Record<string, unknown> {
  if (typeof typedData !== "object" || typedData === null || Array.isArray(typedData)) {
    throw new TypedDataMismatchError("签名对象不是 EIP-712 结构");
  }
  return typedData as Record<string, unknown>;
}

/**
 * 签名前校验（protocol-bindings 单源的宿主适配，治理审计 §1.1 P1-1）：
 * 判定收敛于单源 validateTypedDataForSigning——primaryType 锚定、
 * types[primaryType] 字段表非空、domain 四要素、message 签名者与
 * expectedSubmitter/preparedSubmitters/connectedAddress 交叉核对
 * （防换签名对象），本函数只把拒绝 reason 映射为宿主
 * TypedDataMismatchError 文案；`connectedAddress` 是实际连接的钱包，
 * expectation.submitter 用于交叉确认。
 */
export function validateTypedDataForSigning(
  typedData: unknown,
  expected: SignTypedDataExpectation,
  connectedAddress?: string
): void {
  const check = validateTypedDataEnvelope(typedData, {
    ...expected,
    ...(connectedAddress !== undefined ? { connectedAddress } : {})
  });
  if (!check.ok) {
    throw new TypedDataMismatchError(mismatchMessageFor(check.reason, check.detail, expected));
  }
}

/** 单源拒绝 reason → 宿主文案（措辞与切换前的本地判定一致，行为面零变化）。 */
function mismatchMessageFor(
  reason: TypedDataSigningMismatchReason,
  detail: string | undefined,
  expected: SignTypedDataExpectation
): string {
  const fact = detail ?? "unknown";
  const signerField = expected.submitterField ?? "submitter";
  switch (reason) {
    case "not-typed-data":
    case "message-shape":
      return "签名对象不是 EIP-712 结构";
    case "domain-shape":
      return "签名对象缺少有效的 EIP-712 domain";
    case "primary-type":
      return `primaryType ${fact} 与预期 ${expected.primaryType} 不一致`;
    case "primary-type-fields":
      return `types[${expected.primaryType}] 字段表缺失或为空，签名对象可能被钱包或中转层改写`;
    case "domain-name":
      return `domain.name ${fact} 与预期 ${expected.domainName} 不一致`;
    case "domain-version":
      return `domain.version ${fact} 与预期 ${expected.domainVersion} 不一致`;
    case "domain-chain-id":
      // 单源对"形状非法"与"与预期不符"共用同一 reason：detail 是可解析的
      // 正整数且给出了预期 chainId 时按不一致报告，否则按无效链 ID 报告。
      return expected.chainId !== undefined && isPositiveChainIdText(fact)
        ? `domain.chainId ${fact} 与预期 ${expected.chainId} 不一致`
        : `domain.chainId ${fact} 不是有效的链 ID`;
    case "domain-verifying-contract":
      return isEvmAddressText(fact)
        ? `domain.verifyingContract ${fact} 与预期 ${expected.verifyingContract} 不一致`
        : "domain.verifyingContract 缺失或不是有效地址";
    case "signer-field":
      return `message.${signerField} 缺失或不是有效地址`;
    case "signer-not-connected":
      return `message.${signerField} 与当前连接钱包不一致（${fact}）`;
    case "signer-not-expected":
      return `message.${signerField} 与预期提交方不一致（${fact}）`;
    case "signer-not-prepared":
      return `message.${signerField} 与 prepared 记录的提交方不一致（${fact}）`;
  }
}

function isPositiveChainIdText(value: string): boolean {
  if (!/^\d+$/u.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function isEvmAddressText(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/u.test(value);
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

// 用户拒绝判定（4001 || /reject|denied|cancel/i 超集，含 170ccae 收敛的
// denied/cancel 措辞）已切换为 protocol-bindings 单源
// isUserRejectedRequestError（治理审计 §1.1 P1-1 签名闸门单源行）；
// WalletRejectedError 包装与面向用户的文案留在宿主。
