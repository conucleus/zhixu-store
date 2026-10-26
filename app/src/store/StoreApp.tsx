import {
  Activity,
  AlertTriangle,
  KeyRound,
  Link2,
  Loader2,
  MessageSquareWarning,
  Paintbrush,
  ShieldCheck,
  Store,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  accessFromStoreSession,
  createStoreApiClient,
  readableStoreError,
  readStoredStoreSessionToken,
  storeStoreSessionToken
} from "./api";
import { StoreAccountPage } from "./StoreAccountPage";
import { StoreDesignPage } from "./design/StoreDesignPage";
import { StoreJoinLinkView } from "./links/StoreJoinLinkView";
import { StoreLinkPage } from "./links/StoreLinkPage";
import { StoreMaintenancePage } from "./maintenance/StoreMaintenancePage";
import { StoreOperationsPage } from "./operations/StoreOperationsPage";
import { StoreOrganizationPage } from "./organization/StoreOrganizationPage";
import { StoreShareView } from "./links/StoreShareView";
import { loginStoreSessionWithWallet } from "./session";
import type { StoreApiClient } from "./api";
import type { StoreSessionDTO, StoreZhixuSearchResultDTO } from "./types";
import { shortValue } from "../lib/frontend";

type StoreView = "design" | "organization" | "operations" | "maintenance" | "links" | "account";

type LinkEntry =
  | { readonly kind: "join"; readonly zhixuId: string }
  | { readonly kind: "share"; readonly zhixuId: string };

export function StoreApp() {
  const [sessionToken, setSessionToken] = useState<string | undefined>(() => readStoredStoreSessionToken());
  const baseAccess = useMemo(() => createStoreApiClient().access, []);
  const [session, setSession] = useState<StoreSessionDTO | undefined>();

  useEffect(() => {
    const bootstrapClient = createStoreApiClient(baseAccess);
    if (!bootstrapClient.baseUrl) {
      return;
    }
    let cancelled = false;
    void bootstrapClient.getSession().then((result) => {
      if (!cancelled) {
        setSession(result.data);
      }
    }).catch(() => {
      if (!cancelled) {
        setSession(undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseAccess, sessionToken]);

  const access = useMemo(
    () => (session ? accessFromStoreSession(session, baseAccess) : baseAccess),
    [session, baseAccess],
  );
  const api = useMemo(
    () => createStoreApiClient(access),
    [access],
  );

  const [view, setView] = useState<StoreView>("design");
  const [catalog, setCatalog] = useState<StoreZhixuSearchResultDTO | undefined>();
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | undefined>();
  const linkEntry = useMemo(() => readLinkEntry(), []);

  async function loadCatalog(): Promise<StoreZhixuSearchResultDTO | undefined> {
    try {
      const result = await api.search({});
      setCatalog(result.data);
      setCatalogError(undefined);
      return result.data;
    } catch (error) {
      setCatalogError(readableStoreError(error, "Store 可见秩序加载失败"));
      return undefined;
    }
  }

  useEffect(() => {
    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  function handleSessionEstablished(established: { readonly token: string; readonly expiresAt: string }): void {
    storeStoreSessionToken(established);
    setSessionToken(established.token);
  }

  function handleSessionCleared(): void {
    storeStoreSessionToken(undefined);
    setSession(undefined);
    setSessionToken(undefined);
  }

  async function handleHeaderLogin(): Promise<void> {
    if (loginBusy) {
      return;
    }
    setLoginBusy(true);
    setLoginMessage(undefined);
    try {
      const result = await loginStoreSessionWithWallet(api);
      handleSessionEstablished({ token: result.verify.token, expiresAt: result.verify.session.expiresAt });
      setLoginMessage(`已登录 ${shortValue(result.address)}`);
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleHeaderLogout(): Promise<void> {
    if (loginBusy) {
      return;
    }
    setLoginBusy(true);
    try {
      await api.authLogout();
    } catch {
    }
    handleSessionCleared();
    setLoginMessage("已退出会话");
    setLoginBusy(false);
  }

  if (linkEntry) {
    return (
      <div className="product-app" data-testid="store-link-entry">
        <main className="product-main">
          {linkEntry.kind === "share" ? (
            <>
              <p className="page-subtitle"><a href="/store">返回 Store Console</a></p>
              <StoreShareView api={api} zhixuId={linkEntry.zhixuId} />
            </>
          ) : (
            <StoreJoinLinkView
              access={access}
              api={api}
              zhixuId={linkEntry.zhixuId}
              onSessionEstablished={handleSessionEstablished}
              onSessionCleared={handleSessionCleared}
            />
          )}
        </main>
      </div>
    );
  }

  const navItems: Array<{ readonly view: StoreView; readonly label: string; readonly icon: ReactNode }> = [
    { view: "design", label: "设计", icon: <Paintbrush /> },
    { view: "organization", label: "组织", icon: <Users /> },
    { view: "operations", label: "运营", icon: <Activity /> },
    { view: "maintenance", label: "维护", icon: <MessageSquareWarning /> },
    { view: "links", label: "链接", icon: <Link2 /> },
    { view: "account", label: "账号与地址", icon: <KeyRound /> }
  ];

  return (
    <section
      className="store-console-shell"
      data-testid="store-app"
      data-store-access={access.level}
      data-store-anchored={access.anchoredAddress ? "anchored" : "unanchored"}
    >
      <header className="store-console-head">
        <div className="store-console-brand">
          <span className="store-console-mark"><Store /></span>
          <div>
            <h1>Store Console</h1>
            <p>凝结核运营台：设计秩序、组织参与方、看秩序整体概况、发维护意见信号。</p>
          </div>
        </div>

        <div className="store-tabs" role="tablist" aria-label="Store 运营台导航">
          {navItems.map((item) => (
            <button
              aria-selected={view === item.view}
              className={`store-tab ${view === item.view ? "is-active" : ""}`}
              key={item.view}
              onClick={() => setView(item.view)}
              role="tab"
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div className="store-head-actions">
          <span
            className={`store-access-pill ${access.canWrite ? "can-write" : ""}`}
            data-testid="store-session-pill"
            title={`${access.authMode} · ${access.level}`}
          >
            <ShieldCheck /> {access.label}
            {access.anchoredAddress ? <span className="store-anchored-chip" data-testid="store-anchored-chip">锚定 {shortValue(access.anchoredAddress)}</span> : null}
          </span>
          {sessionToken !== undefined || access.anchoredAddress ? (
            <button className="secondary-button" onClick={() => void handleHeaderLogout()} disabled={loginBusy} data-testid="store-head-logout" type="button">
              退出
            </button>
          ) : (
            <button className="secondary-button" onClick={() => void handleHeaderLogin()} disabled={loginBusy} data-testid="store-head-login" type="button">
              {loginBusy ? <Loader2 className="spin" /> : null} 钱包登录
            </button>
          )}
        </div>
      </header>

      {loginMessage ? <p className="store-head-login-message" data-testid="store-login-message">{loginMessage}</p> : null}

      {view === "design" ? (
        <StoreDesignPage
          access={access}
          api={api}
          catalog={catalog}
          catalogError={catalogError}
          onRefreshCatalog={loadCatalog}
        />
      ) : null}

      {view === "organization" ? (
        <StoreOrganizationPage access={access} api={api} onOpenLinks={() => setView("links")} />
      ) : null}

      {view === "operations" ? (
        <StoreOperationsPage
          api={api}
          catalog={catalog}
          catalogError={catalogError}
          onRefreshCatalog={loadCatalog}
        />
      ) : null}

      {view === "maintenance" ? (
        <StoreMaintenancePage access={access} catalog={catalog} catalogError={catalogError} />
      ) : null}

      {view === "links" ? (
        <StoreLinkPage catalog={catalog} catalogError={catalogError} />
      ) : null}

      {view === "account" ? (
        <StoreAccountPage access={access} api={api} onSessionEstablished={handleSessionEstablished} onSessionCleared={handleSessionCleared} />
      ) : null}
    </section>
  );
}

function readLinkEntry(): LinkEntry | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const params = new URLSearchParams(window.location.search);
  const zhixuId = params.get("join")?.trim() || params.get("share")?.trim();
  if (!zhixuId) {
    return undefined;
  }
  return params.get("join")?.trim()
    ? { kind: "join", zhixuId }
    : { kind: "share", zhixuId };
}
