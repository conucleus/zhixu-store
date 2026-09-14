import {
  isUserRejectedRequestError,
  validateTypedDataForSigning as validateTypedDataEnvelope,
  type TypedDataSigningExpectation
} from "@uvp-eth/protocol-bindings";
import { connectWalletAddress } from "../shared/chain/wallet/connect";
import { ChainWalletError } from "../shared/chain/wallet/errors";
import { isEvmAddressText, isPositiveChainIdText } from "../shared/chain/wallet/typed-data";
import type { TypedDataMismatchTexts } from "../shared/chain/wallet/typed-data";
import {
  assertTypedDataEnvelopeMatches,
  ensureCurrentChainMatchesDomain,
  requestTypedDataSignature
} from "../shared/chain/wallet/typed-data";
import { UnsupportedWalletTargetError, walletConnectorFor } from "../shared/chain/wallet/provider";

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

export {
  /**
   * 目标链轨保留但未实现：fail-closed 抛错。类身份已上收 chain 轨单源
   * （两端 instanceof 同类），此处按原路径 re-export。
   */
  UnsupportedWalletTargetError
};

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
  request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
}

type WindowWithEthereum = Window & {
  readonly ethereum?: BrowserEthereum;
};

/**
 * 本端钱包内核 = chain 轨共享面 + protocol-bindings 端口注入（治理审计
 * §1.1 P1-1 的共享仓形态）：判定（isUserRejectedRequestError /
 * validateTypedDataForSigning）单源于 protocol-bindings，由本适配层原函数
 * 注入；链核对与签名请求的机械段在 shared/chain/wallet 单源；错误分类
 * 映射回本端公开类（WalletNotConnectedError / WalletRejectedError /
 * TypedDataMismatchError），调用点 instanceof 语义不变。
 */
const walletPorts = {
  isUserRejectedRequestError,
  validateTypedDataEnvelope
} as const;

/** 单源拒绝 reason → 本端文案（措辞与切换前的本地判定一致，行为面零变化）。 */
const mismatchTexts: TypedDataMismatchTexts = {
  missingDetail: "unknown",
  notTypedData: "签名对象不是 EIP-712 结构",
  messageShape: "签名对象不是 EIP-712 结构",
  domainShape: "签名对象缺少有效的 EIP-712 domain",
  primaryType: (fact, expected) => `primaryType ${fact} 与预期 ${expected.primaryType} 不一致`,
  primaryTypeFields: (expected) => `types[${expected.primaryType}] 字段表缺失或为空，签名对象可能被钱包或中转层改写`,
  domainName: (fact, expected) => `domain.name ${fact} 与预期 ${expected.domainName} 不一致`,
  domainVersion: (fact, expected) => `domain.version ${fact} 与预期 ${expected.domainVersion} 不一致`,
  domainChainId: (fact, expected) =>
    // 单源对"形状非法"与"与预期不符"共用同一 reason：detail 是可解析的
    // 正整数且给出了预期 chainId 时按不一致报告，否则按无效链 ID 报告。
    expected.chainId !== undefined && isPositiveChainIdText(fact)
      ? `domain.chainId ${fact} 与预期 ${expected.chainId} 不一致`
      : `domain.chainId ${fact} 不是有效的链 ID`,
  domainVerifyingContract: (fact, expected) =>
    isEvmAddressText(fact)
      ? `domain.verifyingContract ${fact} 与预期 ${expected.verifyingContract} 不一致`
      : "domain.verifyingContract 缺失或不是有效地址",
  signerField: (signerField) => `message.${signerField} 缺失或不是有效地址`,
  signerNotConnected: (signerField, fact) => `message.${signerField} 与当前连接钱包不一致（${fact}）`,
  signerNotExpected: (signerField, fact) => `message.${signerField} 与预期提交方不一致（${fact}）`,
  signerNotPrepared: (signerField, fact) => `message.${signerField} 与 prepared 记录的提交方不一致（${fact}）`
};

type ChainWalletErrorCode = "missing_wallet" | "wallet_rejected" | "wallet_signature_failed" | "typed_data_mismatch";

/** 共享内核错误 → 本端公开类（保持调用点 instanceof 分类语义）。 */
function fromChainWalletError(error: ChainWalletError): Error {
  const code = error.code as ChainWalletErrorCode;
  switch (code) {
    case "missing_wallet":
      return new WalletNotConnectedError();
    case "wallet_rejected":
      return new WalletRejectedError();
    case "typed_data_mismatch":
      return new TypedDataMismatchError(error.message);
    default:
      // wallet_signature_failed：本端无对应公开类，原样上抛（message 即
      // 技术细节，readableError 展示路径与切换前一致）。
      return error;
  }
}

export async function requestWalletAccount(): Promise<WalletAccount> {
  try {
    const address = await connectWalletAddress({
      provider: (window as WindowWithEthereum).ethereum,
      ports: walletPorts
    });
    return { address };
  } catch (error) {
    if (error instanceof ChainWalletError) {
      throw fromChainWalletError(error);
    }
    throw error;
  }
}

export async function signTypedData(
  account: WalletAccount,
  typedData: unknown,
  expected: SignTypedDataExpectation
): Promise<string> {
  // 本端既有顺序：信封校验先于 provider 检查（与 order-app 反序，保持）。
  validateTypedDataForSigning(typedData, expected, account.address);
  const ethereum = (window as WindowWithEthereum).ethereum;
  if (!ethereum) {
    throw new WalletNotConnectedError();
  }
  // 域校验不只看格式：签名前至少核对钱包当前连接的链与 domain.chainId 一致，
  // 否则被攻陷的 BFF 可以让参与者把"确认"签到另一条链的无效域上。
  try {
    await ensureCurrentChainMatchesDomain(ethereum, typedData, { ports: walletPorts });
    return await requestTypedDataSignature(ethereum, account.address, typedData, {
      ports: walletPorts,
      texts: mismatchTexts,
      invalidSignatureDetail: "wallet_signature_missing"
    });
  } catch (error) {
    if (error instanceof ChainWalletError) {
      throw fromChainWalletError(error);
    }
    throw error;
  }
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
  try {
    assertTypedDataEnvelopeMatches(
      typedData,
      {
        ...expected,
        ...(connectedAddress !== undefined ? { connectedAddress } : {})
      },
      walletPorts,
      mismatchTexts
    );
  } catch (error) {
    if (error instanceof ChainWalletError && error.code === "typed_data_mismatch") {
      throw new TypedDataMismatchError(error.message);
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
  return walletConnectorFor(target, evmWalletConnector);
}

// 用户拒绝判定（4001 || /reject|denied|cancel/i 超集，含 170ccae 收敛的
// denied/cancel 措辞）已切换为 protocol-bindings 单源
// isUserRejectedRequestError（治理审计 §1.1 P1-1 签名闸门单源行）；
// WalletRejectedError 包装与面向用户的文案留在宿主。
