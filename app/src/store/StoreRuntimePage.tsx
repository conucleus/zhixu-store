import { AlertTriangle, CheckCircle2, ClipboardCheck, Layers3, Loader2, ShieldCheck, Truck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import type { StoreRuntimeSummaryDTO } from "./types";

type RuntimeState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly summary: StoreRuntimeSummaryDTO }
  | { readonly status: "error"; readonly message: string };

export function StoreRuntimePage({ api }: { readonly api: StoreApiClient }) {
  const [state, setState] = useState<RuntimeState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void api.getRuntimeSummary().then((result) => {
      if (!cancelled) {
        setState({ status: "ready", summary: result.data });
      }
    }).catch((error) => {
      if (!cancelled) {
        setState({ status: "error", message: readableStoreError(error, "运行态摘要加载失败") });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <section className="page-shell" data-testid="store-runtime-page">
      <div className="page-title-row">
        <div>
          <h2>运行态观察</h2>
          <p>Store 只读观察订单、待办和背书投影；执行提交仍在订单工作台和执行方工具中完成。</p>
        </div>
      </div>

      {state.status === "loading" ? (
        <StatePanel icon={<Loader2 className="spin" />} title="正在加载运行态" desc="读取 Store 和 Product 投影摘要。" />
      ) : null}

      {state.status === "error" ? (
        <StatePanel icon={<AlertTriangle />} title="运行态接口不可用" desc={state.message} tone="error" />
      ) : null}

      {state.status === "ready" ? (
        <div className="store-runtime-layout">
          <section className="panel-card store-runtime-main">
            <div className="store-panel-label">1. 运行态总览</div>
            <div className="store-runtime-grid">
              <Metric icon={<Layers3 />} label="可用秩序" value={`${state.summary.activeZhixus} 条`} />
              <Metric icon={<Truck />} label="运行订单" value={`${state.summary.runningOrders} 单`} />
              <Metric icon={<ClipboardCheck />} label="开放待办" value={`${state.summary.openTasks} 个`} />
              <Metric icon={<Users />} label="已背书执行方" value={`${state.summary.trustedSuppliers} 个`} />
            </div>
            <section className="store-event-table" aria-label="运行态来源">
              <div className="store-table-head store-event-head">
                <span>来源</span>
                <span>对象</span>
                <span>状态</span>
              </div>
              <div className="store-event-row">
                <span>UVPStateMachine</span>
                <strong>订单 / 待办</strong>
                <em>事件投影</em>
              </div>
              <div className="store-event-row">
                <span>Trust Registry</span>
                <strong>计划 / 供应商背书</strong>
                <em>事件投影</em>
              </div>
              <div className="store-event-row">
                <span>Projection Engine</span>
                <strong>运行态摘要</strong>
                <em>可重建</em>
              </div>
            </section>
          </section>
          <aside className="panel-card store-runtime-side">
            <div className="store-panel-label">2. 回放边界</div>
            <div className="panel-heading">
              <div>
                <h2>回放边界</h2>
                <p>运行态摘要来自可重建投影，不替代合约和事件日志。</p>
              </div>
              <span className="status-badge success"><ShieldCheck /> contracts-and-chain-events</span>
            </div>
            <div className="store-check-list">
              <span><CheckCircle2 /> 订单和待办从 StateMachine 事件投影</span>
              <span><CheckCircle2 /> 计划和供应商背书从 Trust Registry 投影</span>
              <span><CheckCircle2 /> 试拼草稿不会创建订单授权或发布新秩序</span>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
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

function StatePanel({
  icon,
  title,
  desc,
  tone = "muted"
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly desc: string;
  readonly tone?: "muted" | "error";
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
