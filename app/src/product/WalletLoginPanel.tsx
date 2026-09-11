import { KeyRound, Wallet } from "lucide-react";
import { useState } from "react";

/**
 * 非 local 部署的参与者面登录入口：服务端对参与者读写强制钱包会话锚定，
 * 没有会话时首屏请求全部 401。连接钱包 → challenge → personal_sign →
 * verify 换取会话 token（与 Store 入口同一身份通道），登录后由调用方
 * 重载工作台。
 */
export function WalletLoginPanel({
  hasWallet,
  onLogin
}: {
  /** 是否检测到浏览器钱包注入。 */
  readonly hasWallet: boolean;
  readonly onLogin: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleLogin(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onLogin();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "钱包登录失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="state-panel" aria-label="钱包登录" data-testid="workbench-wallet-login-panel">
      <span><KeyRound aria-hidden="true" /></span>
      <div>
        <h2>需要钱包登录</h2>
        <p>此部署要求钱包会话锚定参与者身份。连接浏览器钱包完成一次签名即可查看你的订单与待办；登录在当前标签页内保持，过期后重新签名。</p>
        {hasWallet ? (
          <button className="primary-button" type="button" disabled={busy} onClick={() => void handleLogin()}>
            <Wallet aria-hidden="true" />
            {busy ? "等待钱包签名…" : "连接钱包并登录"}
          </button>
        ) : (
          <p>未检测到浏览器钱包：请先安装钱包扩展（如 MetaMask）后刷新本页。</p>
        )}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
