import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Layers3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Truck,
  Users
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readableStoreError, type StoreApiClient } from "../api";
import type { StoreRuntimeSummaryDTO, StoreZhixuSearchResultDTO } from "../types";

type RuntimeState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly summary: StoreRuntimeSummaryDTO }
  | { readonly status: "error"; readonly message: string };

export function StoreOperationsPage({
  api,
  catalog,
  catalogError,
  onRefreshCatalog
}: {
  readonly api: StoreApiClient;
  readonly catalog?: StoreZhixuSearchResultDTO | undefined;
  readonly catalogError?: string | undefined;
  readonly onRefreshCatalog: () => Promise<StoreZhixuSearchResultDTO | undefined>;
}) {
  const [runtime, setRuntime] = useState<RuntimeState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | undefined>();

  const loadRuntime = useCallback(async () => {
    setRuntime({ status: "loading" });
    try {
      const result = await api.getRuntimeSummary();
      setRuntime({ status: "ready", summary: result.data });
    } catch (error) {
      setRuntime({ status: "error", message: readableStoreError(error, "运营概况加载失败") });
    }
  }, [api]);

  useEffect(() => {
    void loadRuntime();
  }, [loadRuntime]);

  async function handleRefresh(): Promise<void> {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    setRefreshError(undefined);
    try {
      await Promise.all([onRefreshCatalog(), loadRuntime()]);
    } catch (error) {
      setRefreshError(readableStoreError(error, "运营概况刷新失败"));
    } finally {
      setRefreshing(false);
    }
  }

  const summary = catalog?.summary;
  const observed = catalog ? catalog.zhixus.every((zhixu) => zhixu.metricsStatus === "observed") : false;

  return (
    <section className="page-shell store-console-page" data-testid="store-operations-page">
      <div className="page-title-row">
        <div>
          <h2><Layers3 /> 运营</h2>
          <p>秩序整体概况：订单数、阶段待办与异常计数来自可重建投影；这里不逐单，也不提供订单级干预。</p>
        </div>
        <button className="secondary-button" disabled={refreshing} onClick={() => void handleRefresh()} type="button">
          {refreshing ? <Loader2 className="spin" /> : <RefreshCw />} 刷新概况
        </button>
      </div>

      {refreshError ? <div className="action-notice error" role="alert"><AlertTriangle /><span>{refreshError}</span></div> : null}

      <section className="panel-card store-summary-panel" aria-labelledby="store-operations-summary-title">
        <div className="panel-heading compact">
          <div>
            <h2 id="store-operations-summary-title">秩序概况</h2>
            <p>只聚合已经进入投影的事实；投影未观测到的指标显示“未知”，不折算为 0。</p>
          </div>
          <span className="status-badge success"><ShieldCheck /> {catalog?.sourceOfTruth ?? "contracts-and-chain-events"}</span>
        </div>

        {catalogError ? (
          <div className="state-panel error" role="alert">
            <span><AlertTriangle /></span>
            <div>
              <h2>秩序概况加载失败</h2>
              <p>{catalogError}</p>
            </div>
          </div>
        ) : null}

        {!catalog && !catalogError ? (
          <p className="muted"><Loader2 className="spin" /> 正在读取秩序概况…</p>
        ) : null}

        {catalog ? (
          <div className="summary-strip store-summary-strip">
            <SummaryItem icon={<Layers3 />} label="秩序" title={`${summary?.totalZhixus ?? 0} 条`} />
            <SummaryItem icon={<ShieldCheck />} label="可用秩序" title={`${summary?.activeZhixus ?? 0} 条`} tone="success" />
            <SummaryItem
              icon={<ClipboardCheck />}
              label="待处理"
              title={`${summary?.needsReview ?? 0} 条`}
              tone={(summary?.needsReview ?? 0) > 0 ? "warning" : undefined}
            />
            <SummaryItem
              icon={<Truck />}
              label="运行订单"
              title={observed ? `${summary?.runningOrders ?? 0} 单` : "未知"}
              metricStatus={observed ? "observed" : "unknown"}
            />
            <SummaryItem icon={<Users />} label="已登记执行方" title={observed ? `${summary?.registeredSuppliers ?? 0} 个` : "未知"} />
          </div>
        ) : null}
      </section>

      <div className="store-runtime-layout">
        <section className="panel-card store-runtime-main">
          <div className="panel-heading compact">
            <div>
              <span className="store-section-kicker">运行观察</span>
              <h2>订单与待办聚合</h2>
              <p>来自 UVPStateMachine / Identity Registry 事件投影的计数，不展开单笔订单。</p>
            </div>
            {runtime.status === "ready" ? (
              <span
                className={`status-badge ${runtimeIndexerTone(runtime.summary.indexerStatus)}`}
                data-testid="store-runtime-indexer-status"
              >
                {runtimeIndexerIcon(runtime.summary.indexerStatus)} {runtimeIndexerLabel(runtime.summary.indexerStatus)}
              </span>
            ) : null}
          </div>

          {runtime.status === "loading" ? <p className="muted"><Loader2 className="spin" /> 正在读取运行态摘要…</p> : null}

          {runtime.status === "error" ? (
            <div className="state-panel error" role="alert">
              <span><AlertTriangle /></span>
              <div>
                <h2>运行态摘要不可用</h2>
                <p>{runtime.message}</p>
              </div>
            </div>
          ) : null}

          {runtime.status === "ready" ? (
            <>
              <div className="store-runtime-grid">
                <Metric icon={<Layers3 />} label="可用秩序" value={`${runtime.summary.activeZhixuCount} 条`} />
                <Metric icon={<Truck />} label="运行订单" value={`${runtime.summary.runningOrderCount} 单`} />
                <Metric icon={<ClipboardCheck />} label="开放待办" value={`${runtime.summary.openTaskCount} 个`} />
                <Metric icon={<AlertTriangle />} label="阻塞订单" value={`${runtime.summary.blockedOrderCount} 单`} />
              </div>
              <p className="muted">来源：{runtime.summary.sourceOfTruth} · 更新于 {runtime.summary.updatedAt}</p>
            </>
          ) : null}
        </section>

        <aside className="panel-card store-runtime-side">
          <div className="panel-heading compact">
            <div>
              <h3>运营边界</h3>
              <p>运营只读聚合事实，不做订单级追踪、干预或仲裁。</p>
            </div>
          </div>
          <div className="store-check-list">
            <span><CheckCircle2 /> 订单和待办从 StateMachine 事件投影</span>
            <span><CheckCircle2 /> 主体与钱包映射从 Identity Registry 投影</span>
            <span><CheckCircle2 /> 异常不在这里处理：维护块发普通意见信号</span>
            <span><CircleDashed /> 摘要不逐单、不替代合约与事件日志</span>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SummaryItem({
  icon,
  label,
  title,
  tone,
  metricStatus
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly title: string;
  readonly tone?: "success" | "warning" | undefined;
  readonly metricStatus?: "observed" | "unknown" | undefined;
}) {
  return (
    <div className={`summary-item ${tone ?? ""}`} data-metric-status={metricStatus}>
      {icon}
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="kpi-card store-runtime-metric">
      <span>{label}</span>
      <strong>{icon}{value}</strong>
    </div>
  );
}

function runtimeIndexerLabel(status: StoreRuntimeSummaryDTO["indexerStatus"]): string {
  switch (status) {
    case "ready":
      return "索引已同步";
    case "syncing":
      return "索引同步中";
    case "rebuilding":
      return "索引重建中";
    case "degraded":
      return "索引降级";
  }
}

function runtimeIndexerTone(status: StoreRuntimeSummaryDTO["indexerStatus"]): "success" | "warning" | "info" {
  if (status === "ready") {
    return "success";
  }
  if (status === "degraded") {
    return "warning";
  }
  return "info";
}

function runtimeIndexerIcon(status: StoreRuntimeSummaryDTO["indexerStatus"]): ReactNode {
  return status === "ready" ? <CheckCircle2 /> : status === "degraded" ? <AlertTriangle /> : <CircleDashed />;
}
