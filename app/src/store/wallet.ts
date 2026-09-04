/**
 * PRD89 Store 侧钱包连接：仅用于"证明控制地址"的会话签名
 * （eth_requestAccounts + eth_personalSign）。与 Product Workbench 的
 * EIP-712 交易签名（product/wallet.ts）互不替代——Store 会话签名永远
 * 不授权链上动作（消息文本明示这一点）。
 */

export class StoreWalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreWalletError";
  }
}

interface EthereumProvider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
}

function ethereumProvider(): EthereumProvider | undefined {
  const injected = (window as unknown as { readonly ethereum?: unknown }).ethereum;
  if (!injected || typeof injected !== "object") {
    return undefined;
  }
  const candidate = injected as Partial<EthereumProvider>;
  if (typeof candidate.request !== "function") {
    return undefined;
  }
  return candidate as EthereumProvider;
}

export function hasStoreWallet(): boolean {
  return ethereumProvider() !== undefined;
}

export async function requestStoreWalletAddress(): Promise<string> {
  const provider = ethereumProvider();
  if (!provider) {
    throw new StoreWalletError("未检测到浏览器钱包（window.ethereum）");
  }
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" }) as unknown;
    const first = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof first !== "string" || first.length === 0) {
      throw new StoreWalletError("钱包没有返回可用地址");
    }
    return first;
  } catch (error) {
    if (error instanceof StoreWalletError) {
      throw error;
    }
    throw new StoreWalletError(error instanceof Error ? error.message : "连接钱包失败");
  }
}

export async function personalSignMessage(address: string, message: string): Promise<string> {
  const provider = ethereumProvider();
  if (!provider) {
    throw new StoreWalletError("未检测到浏览器钱包（window.ethereum）");
  }
  try {
    const signature = await provider.request({
      method: "personal_sign",
      params: [message, address]
    }) as unknown;
    if (typeof signature !== "string" || signature.length === 0) {
      throw new StoreWalletError("钱包没有返回签名");
    }
    return signature;
  } catch (error) {
    if (error instanceof StoreWalletError) {
      throw error;
    }
    throw new StoreWalletError(error instanceof Error ? error.message : "签名失败");
  }
}
