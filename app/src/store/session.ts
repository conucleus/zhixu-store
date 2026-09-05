/**
 * 会话配对编排：challenge → 钱包 personal_sign → verify → token。
 * 签名消息由服务端下发并明示"只建立会话，不授权任何链上动作"。
 */
import type { StoreApiClient } from "./api";
import { personalSignMessage, requestStoreWalletAddress } from "./wallet";
import type { StoreWalletSessionVerifyResult } from "./types";

export interface StoreLoginResult {
  readonly verify: StoreWalletSessionVerifyResult;
  readonly address: string;
}

/**
 * 登录：挑战必须发给"将要签名的地址"，因此先取钱包当前活动账户，
 * 再取挑战并签名（挑战一次性、带 TTL）。
 */
export async function loginStoreSessionWithWallet(
  api: StoreApiClient,
): Promise<StoreLoginResult> {
  const address = await requestStoreWalletAddress();
  const challenge = await api.authChallenge({ address, intent: "login" });
  const signature = await personalSignMessage(address, challenge.data.message);
  const verify = await api.authVerify({ nonce: challenge.data.nonce, signature });
  return { verify: verify.data, address };
}

/**
 * 为当前账号锚定另一个地址：持有会话 token 的用户请求 anchor_address
 * 挑战，由钱包当前活动地址签名（切换到团队成员地址后操作）。
 */
export async function anchorAdditionalWalletToAccount(
  api: StoreApiClient,
): Promise<StoreWalletSessionVerifyResult> {
  const address = await requestStoreWalletAddress();
  const challenge = await api.authChallenge({ address, intent: "anchor_address" });
  const signature = await personalSignMessage(address, challenge.data.message);
  const verify = await api.authVerify({ nonce: challenge.data.nonce, signature });
  return verify.data;
}
