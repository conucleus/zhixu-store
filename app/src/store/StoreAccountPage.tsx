import { KeyRound, Link2, Loader2, LogIn, LogOut, ShieldCheck, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import { anchorAdditionalWalletToAccount, loginStoreSessionWithWallet } from "./session";
import { hasStoreWallet } from "./wallet";
import type { StoreAccessState } from "./types";
import { shortValue } from "../shared/frontend";

type AddressesState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly accountId: string; readonly addresses: readonly { readonly address: string; readonly status: "active" | "revoked"; readonly anchoredAt: string }[] }
  | { readonly status: "error"; readonly message: string };

/**
 * 账号页：钱包登录（SIWE 式签名证明）+ 地址管理。
 * 一个账号可关联多个地址（凝结核团队成员）；当前会话锚定的地址不可撤销。
 */
export function StoreAccountPage({
  access,
  api,
  onSessionToken,
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly onSessionToken: (token?: string | undefined) => void;
}) {
  const [addressesState, setAddressesState] = useState<AddressesState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  const anchored = access.anchoredAddress;

  const reloadAddresses = useCallback(async () => {
    if (!anchored) {
      setAddressesState({ status: "idle" });
      return;
    }
    setAddressesState({ status: "loading" });
    try {
      const result = await api.listAccountAddresses();
      setAddressesState({ status: "ready", accountId: result.data.accountId, addresses: result.data.addresses });
    } catch (error) {
      setAddressesState({ status: "error", message: readableStoreError(error, "地址列表加载失败") });
    }
  }, [api, anchored]);

  useEffect(() => {
    void reloadAddresses();
  }, [reloadAddresses]);

  async function handleLogin(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await loginStoreSessionWithWallet(api);
      setMessage(`已登录 ${shortValue(result.address)}（会话已锚定该地址）`);
      onSessionToken(result.verify.token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : readableStoreError(error, "登录失败"));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      await api.authLogout();
      setMessage("已退出会话");
      onSessionToken(undefined);
    } catch (error) {
      setMessage(readableStoreError(error, "退出失败"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAnchor(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await anchorAdditionalWalletToAccount(api);
      setMessage(`已为账号锚定 ${shortValue(result.session.anchoredAddress)}（切换钱包账户后重新登录即可用该地址操作）`);
      await reloadAddresses();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : readableStoreError(error, "锚定失败"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(address: string): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await api.revokeAccountAddress(address);
      setAddressesState({ status: "ready", accountId: result.data.accountId, addresses: result.data.addresses });
      setMessage(`已撤销 ${shortValue(address)} 的锚定`);
    } catch (error) {
      setMessage(readableStoreError(error, "撤销失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="store-account-page" data-testid="store-account-page">
      <header className="store-panel-head">
        <h2><KeyRound /> 账号与地址</h2>
        <p>会话配对：登录会话必须声明并证明控制一个钱包地址；敏感操作（授权、装修、审核写操作）只对已锚定地址的会话开放。</p>
      </header>

      <div className="store-account-current" data-testid="store-account-current">
        {anchored ? (
          <>
            <span className="store-account-anchored"><ShieldCheck /> 当前会话锚定 {shortValue(anchored)}</span>
            <span className="store-account-meta">{access.label} · {access.authMode}{access.anchorSource ? ` · ${access.anchorSource}` : ""}</span>
            <button className="secondary-button" onClick={() => void handleLogout()} disabled={busy} data-testid="store-logout-button">
              {busy ? <Loader2 className="spin" /> : <LogOut />} 退出会话
            </button>
          </>
        ) : (
          <>
            <span className="store-account-anchored is-muted">当前会话未锚定地址（{access.label}）</span>
            {hasStoreWallet() ? (
              <button className="primary-button" onClick={() => void handleLogin()} disabled={busy} data-testid="store-login-button">
                {busy ? <Loader2 className="spin" /> : <LogIn />} 连接钱包登录
              </button>
            ) : (
              <span className="store-account-warn">未检测到浏览器钱包；本地联调可由服务端配置 dev 锚定地址。</span>
            )}
          </>
        )}
      </div>

      {message ? <p className="store-account-message" data-testid="store-account-message">{message}</p> : null}

      {anchored ? (
        <div className="store-address-list" data-testid="store-address-list">
          <div className="store-address-head">
            <h3>账号地址</h3>
            <button className="secondary-button" onClick={() => void handleAnchor()} disabled={busy} data-testid="store-anchor-address-button">
              {busy ? <Loader2 className="spin" /> : <Link2 />} 锚定新地址（团队成员）
            </button>
          </div>
          <p className="store-address-note">签名只证明地址控制权，不携带任何链上授权。</p>
          {addressesState.status === "loading" ? <p className="muted"><Loader2 className="spin" /> 正在读取地址…</p> : null}
          {addressesState.status === "error" ? <p className="store-account-message is-error">{addressesState.message}</p> : null}
          {addressesState.status === "ready" ? (
            <table className="store-data-table" data-testid="store-address-table">
              <thead>
                <tr>
                  <th>地址</th>
                  <th>状态</th>
                  <th>锚定时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {addressesState.addresses.map((entry) => (
                  <tr key={entry.address} data-testid="store-address-row">
                    <td className="mono">{entry.address}</td>
                    <td>{entry.status === "active" ? "生效" : "已撤销"}</td>
                    <td>{new Date(entry.anchoredAt).toLocaleString()}</td>
                    <td>
                      {entry.status === "active" && entry.address.toLowerCase() !== anchored.toLowerCase() ? (
                        <button className="secondary-button" onClick={() => void handleRevoke(entry.address)} disabled={busy}>
                          <Unlink /> 撤销
                        </button>
                      ) : entry.address.toLowerCase() === anchored.toLowerCase() ? (
                        <span className="muted">当前会话</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
