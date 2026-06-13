import { AlertTriangle, ExternalLink, GitBranch, Loader2, PackageSearch, ShieldCheck, Store, Truck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { accessFromStoreSession, createStoreApiClient, readableStoreError, StoreApiError } from "./api";
import { StoreDockingPage } from "./StoreDockingPage";
import { StoreRuntimePage } from "./StoreRuntimePage";
import { StoreSearchPage } from "./StoreSearchPage";
import { StoreSupplierPage } from "./StoreSupplierPage";
import { StoreZhixuDetailPage } from "./StoreZhixuDetailPage";
import type { StoreApiClient } from "./api";
import type { StoreAccessState, StoreApiSource, StoreSearchInput, StoreZhixuSearchResultDTO } from "./types";

type StoreView = "search" | "detail" | "suppliers" | "runtime" | "docking";

type StoreLoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: StoreZhixuSearchResultDTO; readonly source: StoreApiSource }
  | { readonly status: "error"; readonly message: string };

interface StoreConsoleE2EBridge {
  readonly state: {
    readonly accessLevel: string;
    readonly canWrite: boolean;
    readonly view: StoreView;
    readonly loadStatus: StoreLoadState["status"];
  };
  attemptImportDraft(): Promise<{ readonly ok: boolean; readonly status: number; readonly message: string }>;
}

declare global {
  interface Window {
    __uvpStoreConsoleE2E?: StoreConsoleE2EBridge;
  }
}

export function StoreApp({ productHref = "/app" }: { readonly productHref?: string | undefined }) {
  const api = useMemo(() => createStoreApiClient(), []);
  const [access, setAccess] = useState<StoreAccessState>(api.access);
  const [view, setView] = useState<StoreView>("search");
  const [selectedZhixuId, setSelectedZhixuId] = useState<string | undefined>();
  const [loadState, setLoadState] = useState<StoreLoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (api.baseUrl) {
      void api.getSession().then((result) => {
        if (!cancelled) {
          setAccess(accessFromStoreSession(result.data, api.access));
        }
      }).catch(() => {
        if (!cancelled) {
          setAccess(api.access);
        }
      });
    }
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
    { view: "runtime", label: "运行态", icon: <Truck /> },
    { view: "docking", label: "试拼沙箱", icon: <GitBranch /> }
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

  useEffect(() => {
    if (!isStoreE2EBridgeEnabled()) {
      return;
    }
    window.__uvpStoreConsoleE2E = {
      state: {
        accessLevel: access.level,
        canWrite: access.canWrite,
        view,
        loadStatus: loadState.status
      },
      async attemptImportDraft() {
        try {
          await api.importZhixuDraft({
            sourceKind: "zhixu_yaml",
            content: "name: e2e-unauthorized-import-probe\n",
            title: "E2E unauthorized import probe"
          });
          return { ok: true, status: 200, message: "ok" };
        } catch (error) {
          return {
            ok: false,
            status: error instanceof StoreApiError ? error.status : 0,
            message: readableStoreError(error, "Store write failed")
          };
        }
      }
    };
    return () => {
      delete window.__uvpStoreConsoleE2E;
    };
  }, [access.canWrite, access.level, api, loadState.status, view]);

  return (
    <section className="store-console-shell" data-testid="store-app" data-store-access={access.level}>
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
              onClick={() => setView(item.view)}
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
          </span>
          <a className="secondary-button store-workbench-link" href={productHref}>前往订单工作台 <ExternalLink /></a>
        </div>
      </header>

      {loadState.status === "ready" && loadState.source.kind === "mock" ? (
        <StoreRuntimeBanner source={loadState.source} />
      ) : null}

      {loadState.status === "loading" ? (
        <StoreStatePanel icon={<Loader2 className="spin" />} title="正在加载秩序商店" desc="读取 Store 目录和链上投影摘要。" />
      ) : null}

      {loadState.status === "error" ? (
        <StoreStatePanel icon={<AlertTriangle />} title="秩序商店加载失败" desc={loadState.message} tone="error" />
      ) : null}

      {loadState.status === "ready" && view === "search" ? (
        <StoreSearchPage
          access={access}
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
          onGetDraft={(draftId) => api.getZhixuDraft(draftId)}
          onRequestDraftAttestation={(draftId, input) => api.requestZhixuDraftAttestation(draftId, input)}
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
    </section>
  );
}

function isStoreE2EBridgeEnabled(): boolean {
  return import.meta.env.VITE_UVP_PRODUCT_E2E === "1" || !import.meta.env.PROD;
}

function StoreRuntimeBanner({ source }: { readonly source: Extract<StoreApiSource, { readonly kind: "mock" }> }) {
  return (
    <div className="runtime-banner is-mock">
      <AlertTriangle />
      <div>
        <strong>Store 开发样例模式</strong>
        <p>{source.reason}</p>
      </div>
    </div>
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
