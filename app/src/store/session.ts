/* 会话配对编排（challenge → 钱包签名 → verify → token），单源为 store/api.ts 的客户端。 */
import type { StoreApiClient } from "./api";
import { personalSignMessage, requestStoreWalletAddress } from "./wallet";
import type { StoreWalletSessionVerifyResult } from "./types";

export interface StoreLoginResult {
  readonly verify: StoreWalletSessionVerifyResult;
  readonly address: string;
}

export async function loginStoreSessionWithWallet(
  api: StoreApiClient,
): Promise<StoreLoginResult> {
  const address = await requestStoreWalletAddress();
  const challenge = await api.authChallenge({ address, intent: "login" });
  const signature = await personalSignMessage(address, challenge.data.message);
  const verify = await api.authVerify({ nonce: challenge.data.nonce, signature });
  if (!verify.data.session?.expiresAt) {
    throw new Error("会话响应缺少过期时间，已放弃本次登录");
  }
  return { verify: verify.data, address };
}

export async function anchorAdditionalWalletToAccount(
  api: StoreApiClient,
): Promise<StoreWalletSessionVerifyResult> {
  const address = await requestStoreWalletAddress();
  const challenge = await api.authChallenge({ address, intent: "anchor_address" });
  const signature = await personalSignMessage(address, challenge.data.message);
  const verify = await api.authVerify({ nonce: challenge.data.nonce, signature });
  return verify.data;
}
