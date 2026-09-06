import { AlertTriangle, ExternalLink, GitBranch, KeyRound, Loader2, PackageSearch, ShieldCheck, Store, Truck, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  accessFromStoreSession,
  createStoreApiClient,
  readableStoreError,
  readStoredStoreSessionToken,
  storeStoreSessionToken,
} from "./api";
import { StoreAccountPage } from "./StoreAccountPage";
import { StoreDockingPage } from "./StoreDockingPage";
import { StoreJoinPage } from "./StoreJoinPage";
import { StoreRuntimePage } from "./StoreRuntimePage";
import { StoreSearchPage } from "./StoreSearchPage";
import { StoreSupplierPage } from "./StoreSupplierPage";
import { StoreZhixuDetailPage } from "./StoreZhixuDetailPage";
import { loginStoreSessionWithWallet } from "./session";
import type { StoreApiClient } from "./api";
import type { StoreApiSource, StoreSearchInput, StoreSessionDTO, StoreZhixuSearchResultDTO } from "./types";
import { shortValue } from "../shared/frontend";

type StoreView = "search" | "detail" | "suppliers" | "runtime" | "docking" | "account" | "join";

type StoreLoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: StoreZhixuSearchResultDTO; readonly source: StoreApiSource }
  | { readonly status: "error"; readonly message: string };

export function StoreApp({ productHref = "/app" }: { readonly productHref?: string | undefined }) {
  // 会话 token 驱动 client 重建——登录/退出后 access 与能力随之刷新。
  const [sessionToken, setSessionToken] = useState<string | undefined>(() => readStoredStoreSessionToken());
  // env 只提供引导态（无会话时的缺省 access）；会话取回后 access 一律以
  // 服务端 session 为准，UI 门控与 client 前置门共用同一份，消除两源不一致。
  const baseAccess = useMemo(() => createStoreApiClient().access, []);
  const [session, setSession] = useState<StoreSessionDTO | undefined>();

  useEffect(() => {
    const bootstrapClient = createStoreApiClient(baseAccess, sessionToken);
    if (!bootstrapClient.baseUrl) {
      return;
    }
    let cancelled = false;
    void bootstrapClient.getSession().then((result) => {
      if (!cancelled) {
        setSession(result.data);
      }
    }).catch(() => {
      // 会话不可得（未登录/接口失败）即回到 env 引导态，不猜权限。
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
    () => createStoreApiClient(access, sessionToken),
    [access, sessionToken],
  );
  const [view, setView] = useState<StoreView>("search");
  const [selectedZhixuId, setSelectedZhixuId] = useState<string | undefined>();
  const [joinPlanFilter, setJoinPlanFilter] = useState<string | undefined>();
  const [joinZhixuFilter, setJoinZhixuFilter] = useState<string | undefined>();
  const [loadState, setLoadState] = useState<StoreLoadState>({ status: "loading" });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void api.search().then((result) => {
      if (!cancelled) {
        setLoadState({ status: "ready", data: result.data, source: result.source });
        setSelectedZhixuId((current) => current ?? result.data.zhixus[0]?.zhixuId);
      }
    }).catch((error) => {
      if (!cancelled) {
        setLoadState({ status: "error", message: readableStoreError(error, "秩序商店加载失败") });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const navItems: Array<{ readonly view: StoreView; readonly label: string; readonly icon: ReactNode }> = [
    { view: "search", label: "秩序检索", icon: <PackageSearch /> },
    { view: "suppliers", label: "供应商", icon: <Users /> },
    { view: "join", label: "加入申请", icon: <UserPlus /> },
    { view: "runtime", label: "运行态", icon: <Truck /> },
    { view: "docking", label: "试拼沙箱", icon: <GitBranch /> },
    { view: "account", label: "账号与地址", icon: <KeyRound /> }
  ];

  function openDetail(zhixuId: string): void {
    setSelectedZhixuId(zhixuId);
    setView("detail");
  }

  async function handleSearch(input: StoreSearchInput): Promise<StoreZhixuSearchResultDTO> {
    const result = await api.search(input);
    setLoadState({ status: "ready", data: result.data, source: result.source });
    setSelectedZhixuId((current) => current ?? result.data.zhixus[0]?.zhixuId);
    return result.data;
  }

  function handleSessionChanged(token?: string | undefined): void {
    if (token !== undefined) {
      storeStoreSessionToken(token);
      setSessionToken(token);
      return;
    }
    // 退出：token 与会话态立即同步清除，权限门随 access 回到引导态。
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
      storeStoreSessionToken(result.verify.token);
      setSessionToken(result.verify.token);
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
      // token 已失效也按退出处理。
    }
    handleSessionChanged(undefined);
    setLoginMessage("已退出会话");
    setLoginBusy(false);
  }

  return (
    <section className="store-console-shell" data-testid="store-app" data-store-access={access.level} data-store-anchored={access.anchoredAddress ? "anchored" : "unanchored"}>
      <header className="store-console-head">
        <div className="store-console-brand">
          <span className="store-console-mark"><Store /></span>
          <div>
            <h1>Store Console</h1>
            <p>凝结核和治理操作员查看秩序、供应商、运行态和试拼草稿。</p>
          </div>
        </div>

        <div className="store-tabs" role="tablist" aria-label="秩序商店导航">
          {navItems.map((item) => (
            <button
              aria-selected={view === item.view}
              className={`store-tab ${view === item.view ? "is-active" : ""}`}
              key={item.view}
              onClick={() => {
                if (item.view === "join") {
                  // 导航进入"加入申请"时清除上一详情页带来的 plan 过滤。
                  setJoinPlanFilter(undefined);
                }
                setView(item.view);
              }}
              role="tab"
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
            title={`${access.authMode} · ${access.capabilities.join(", ")}`}
          >
            <ShieldCheck /> {access.label}
            {access.anchoredAddress ? <span className="store-anchored-chip" data-testid="store-anchored-chip">锚定 {shortValue(access.anchoredAddress)}</span> : null}
          </span>
          {access.anchoredAddress ? (
            <button className="secondary-button" onClick={() => void handleHeaderLogout()} disabled={loginBusy} data-testid="store-head-logout">
              退出
            </button>
          ) : (
            <button className="secondary-button" onClick={() => void handleHeaderLogin()} disabled={loginBusy} data-testid="store-head-login">
              {loginBusy ? <Loader2 className="spin" /> : null} 钱包登录
            </button>
          )}
          <a className="secondary-button store-workbench-link" href={productHref}>前往订单工作台 <ExternalLink /></a>
        </div>
      </header>

      {loginMessage ? <p className="store-head-login-message" data-testid="store-login-message">{loginMessage}</p> : null}

      {loadState.status === "loading" ? (
        <StoreStatePanel icon={<Loader2 className="spin" />} title="正在加载秩序商店" desc="读取 Store 目录和链上投影摘要。" />
      ) : null}

      {loadState.status === "error" ? (
        <StoreStatePanel icon={<AlertTriangle />} title="秩序商店加载失败" desc={loadState.message} tone="error" />
      ) : null}

      {loadState.status === "ready" && view === "search" ? (
        <StoreSearchPage
          access={access}
          api={api}
          result={loadState.data}
          onSearch={handleSearch}
          onGoDocking={() => setView("docking")}
          onOpenZhixu={openDetail}
          onImportDraft={(input) => api.importZhixuDraft(input)}
          onCompileDraft={(draftId) => api.compileZhixuDraft(draftId)}
          onGetDraftProductSchema={(draftId) => api.getDraftProductSchema(draftId)}
          onUpdateDraftProductSchema={(draftId, productSchema) => api.updateDraftProductSchema(draftId, productSchema)}
          onValidateDraftProductSchema={(draftId, productSchema) => api.validateDraftProductSchema(draftId, productSchema)}
          onSubmitDraftReview={(draftId) => api.submitZhixuDraftReview(draftId)}
          onRefreshCatalog={async () => {
            const result = await api.search();
            setLoadState({ status: "ready", data: result.data, source: result.source });
            return result.data;
          }}
        />
      ) : null}

      {loadState.status === "ready" && view === "detail" && selectedZhixuId ? (
        <StoreZhixuDetailPage
          access={access}
          api={api}
          onBack={() => setView("search")}
          onOpenDocking={() => setView("docking")}
          onOpenJoinForPlan={(planId, zhixuId) => {
            setJoinPlanFilter(planId);
            setJoinZhixuFilter(zhixuId);
            setView("join");
          }}
          zhixuId={selectedZhixuId}
        />
      ) : null}

      {loadState.status === "ready" && view === "suppliers" ? (
        <StoreSupplierPage access={access} api={api} />
      ) : null}

      {loadState.status === "ready" && view === "runtime" ? (
        <StoreRuntimePage api={api} />
      ) : null}

      {loadState.status === "ready" && view === "docking" ? (
        <StoreDockingPage
          access={access}
          api={api}
          initialSourceZhixuId={selectedZhixuId}
          zhixus={loadState.data.zhixus}
        />
      ) : null}

      {view === "account" ? (
        <StoreAccountPage access={access} api={api} onSessionToken={handleSessionChanged} />
      ) : null}

      {view === "join" ? (
        <StoreJoinPage access={access} api={api} planIdFilter={joinPlanFilter} zhixuFilter={joinZhixuFilter} />
      ) : null}
    </section>
  );
}

function StoreStatePanel({
  icon,
  title,
  desc,
  tone = "muted"
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly desc: string;
  readonly tone?: "muted" | "error" | undefined;
}) {
  return (
    <section className={`state-panel ${tone}`}>
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </section>
  );
}
