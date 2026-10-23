import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { readableStoreError, type StoreApiClient } from "../api";
import { StoreJoinEntry } from "../StoreJoinEntry";
import { evaluateJoinEntryGate } from "./joinEntryGate";
import { loginStoreSessionWithWallet } from "../session";
import type { StoreAccessState, StoreZhixuOverlayView } from "../types";
import type { StoreZhixuDetailDTO } from "@uvp-eth/product-dto";
import { shortValue } from "../../lib/frontend";

type JoinLinkState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly zhixu: StoreZhixuDetailDTO; readonly overlay?: StoreZhixuOverlayView | undefined }
  | { readonly status: "error"; readonly message: string };

export function StoreJoinLinkView({
  access,
  api,
  zhixuId,
  onSessionEstablished,
  onSessionCleared
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly zhixuId: string;
  readonly onSessionEstablished: (session: { readonly token: string; readonly expiresAt: string }) => void;
  readonly onSessionCleared: () => void;
}) {
  const [state, setState] = useState<JoinLinkState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void api.getZhixuDetailWithOverlay(zhixuId).then((result) => {
      if (!cancelled) {
        setState({ status: "ready", zhixu: result.data.zhixu, ...(result.data.overlay ? { overlay: result.data.overlay } : {}) });
      }
    }).catch((error) => {
      if (!cancelled) {
        setState({ status: "error", message: readableStoreError(error, "加入页加载失败") });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, zhixuId]);

  async function handleLogin(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setLoginMessage(undefined);
    try {
      const result = await loginStoreSessionWithWallet(api);
      onSessionEstablished({ token: result.verify.token, expiresAt: result.verify.session.expiresAt });
      setLoginMessage(`已登录 ${shortValue(result.address)}`);
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : "钱包登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setLoginMessage(undefined);
    try {
      await api.authLogout();
    } catch {
    }
    onSessionCleared();
    setLoginMessage("已退出会话");
    setBusy(false);
  }

  if (state.status === "loading") {
    return (
      <section className="page-shell" data-testid="store-join-link-view">
        <p className="muted"><Loader2 className="spin" /> 正在加载邀请信息…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="page-shell" data-testid="store-join-link-view">
        <div className="state-panel error" role="alert">
          <span><AlertTriangle /></span>
          <div>
            <h2>邀请链接不可用</h2>
            <p>{state.message}</p>
          </div>
        </div>
      </section>
    );
  }

  const zhixu = state.zhixu;
  const theme = state.overlay?.decoration?.current?.data.theme;
  const joinGate = evaluateJoinEntryGate(state.overlay);
  return (
    <section className="page-shell" data-testid="store-join-link-view" data-zhixu-id={zhixuId}>
      <header className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="store-section-kicker">邀请加入秩序</span>
            <h1>{theme?.displayName ?? zhixu.title}</h1>
            <p>{theme?.description ?? zhixu.subtitle}</p>
          </div>
          <span className="status-badge info"><ShieldCheck /> 链接入口</span>
        </div>
        <p className="muted">维护方：{zhixu.maintainer}。链接只用于确认身份与角色；不出现目录、搜索或公开推荐。</p>
        <div className="button-row">
          {access.anchoredAddress ? (
            <>
              <span className="store-access-pill can-write" data-testid="store-join-link-anchored">
                <ShieldCheck /> 已锚定 {shortValue(access.anchoredAddress)}
              </span>
              <button className="secondary-button" disabled={busy} onClick={() => void handleLogout()} type="button">退出会话</button>
            </>
          ) : (
            <button className="primary-button" data-testid="store-join-link-login" disabled={busy} onClick={() => void handleLogin()} type="button">
              {busy ? <Loader2 className="spin" /> : null} 钱包登录后提交申请
            </button>
          )}
          <a className="secondary-button" href="/store">进入运营台</a>
        </div>
        {loginMessage ? <p className="store-account-message" data-testid="store-join-link-message">{loginMessage}</p> : null}
      </header>

      <div className="store-detail-grid">
        <section className="panel-card">
          <div className="panel-heading compact">
            <div>
              <span className="store-section-kicker">角色</span>
              <h2>可申请的角色槽位</h2>
              <p>审核通过后，身份配对与授权事实会记录；是否被接受由该秩序的发布者决定。</p>
            </div>
          </div>
          <div className="store-slot-grid">
            {zhixu.roleSlots.map((slot) => (
              <article className="store-slot-card" key={slot.roleSlotId}>
                <div className="store-slot-card-head">
                  <div>
                    <span className="store-slot-id">{slot.required ? "必需角色" : "可选角色"}</span>
                    <h3>{slot.performanceSlotLabel || slot.title}</h3>
                    <p>{slot.title} · {slot.statusLabel}</p>
                  </div>
                </div>
                <p className="store-slot-duty">{slot.description}</p>
                {slot.expectedEvidence.length > 0 ? <p className="muted">职责凭证：{slot.expectedEvidence.join("、")}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <aside className="right-stack">
          {joinGate.open ? (
            <StoreJoinEntry
              access={access}
              api={api}
              planId={zhixu.planId}
              roleSlots={zhixu.roleSlots.map((slot) => ({ slotId: slot.roleSlotId, title: slot.title }))}
              stageIds={zhixu.stages.map((stage) => stage.stageId)}
              onSubmitted={() => undefined}
            />
          ) : (
            <section
              className="side-panel store-suppression-banner"
              data-testid="store-join-suppression"
              data-suppression-code={joinGate.code}
              role="status"
            >
              <div className="side-panel-title">
                <h3><ShieldAlert /> 暂不开放加入</h3>
              </div>
              <p>{joinGate.reason}</p>
              <p className="muted">
                加入入口只在秩序已上架且锚定核验一致时开放；未上架、已下架或锚定冲突时不会出现可提交的入口，
                也不会发出加入申请。
              </p>
            </section>
          )}
          <section className="side-panel">
            <div className="side-panel-title"><h3>说明</h3></div>
            <p className="muted">
              提交申请只表达加入意愿，不产生订单、资金或链上动作；审核由该秩序的发布者或受托成员完成。
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
