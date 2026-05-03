import { AlertTriangle, GitBranch, Loader2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { StoreZhixuConsoleDTO } from "@uvp-eth/product-dto";
import { readableStoreError, type StoreApiClient } from "./api";
import type { StoreAccessState, StoreDockingSessionDTO } from "./types";

type DockingState =
  | { readonly status: "idle" }
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly session: StoreDockingSessionDTO }
  | { readonly status: "error"; readonly message: string };

export function StoreDockingPage({
  access,
  api,
  initialSourceZhixuId,
  zhixus
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly initialSourceZhixuId?: string;
  readonly zhixus: readonly StoreZhixuConsoleDTO[];
}) {
  const sourceZhixu = useMemo(
    () => zhixus.find((item) => item.zhixuId === initialSourceZhixuId) ?? zhixus[0],
    [initialSourceZhixuId, zhixus]
  );
  const targetZhixu = useMemo(
    () => zhixus.find((item) => item.zhixuId !== sourceZhixu?.zhixuId) ?? sourceZhixu,
    [sourceZhixu, zhixus]
  );
  const [state, setState] = useState<DockingState>({ status: "idle" });

  async function createSession(): Promise<void> {
    if (!sourceZhixu || !targetZhixu) {
      setState({ status: "error", message: "缺少可试拼的秩序版本" });
      return;
    }
    setState({ status: "pending" });
    try {
      const result = await api.createDockingSession({
        sourceZhixuId: sourceZhixu.zhixuId,
        targetZhixuId: targetZhixu.zhixuId
      });
      setState({ status: "ready", session: result.data });
    } catch (error) {
      setState({ status: "error", message: readableStoreError(error, "试拼会话创建失败") });
    }
  }

  return (
    <section className="page-shell" data-testid="store-docking-page">
      <div className="page-title-row">
        <div>
          <h2>试拼沙箱</h2>
          <p>只创建非发布草稿，用来检查两个秩序之间的信号接口是否能对齐。</p>
        </div>
        {access.canWrite ? (
          <button className="primary-button" data-testid="store-create-docking-session-button" disabled={state.status === "pending"} onClick={createSession}>
            {state.status === "pending" ? <Loader2 className="spin" /> : <GitBranch />}
            创建试拼会话
          </button>
        ) : null}
      </div>

      {!access.canWrite ? (
        <div className="runtime-banner is-mock">
          <AlertTriangle />
          <div>
            <strong>只读访问</strong>
            <p>需要 Store operator 或 admin 才能保存试拼草稿。</p>
          </div>
        </div>
      ) : null}

      <div className="store-runtime-grid">
        <div className="kpi-card">
          <span>来源秩序</span>
          <strong>{sourceZhixu?.title ?? "暂无"}</strong>
        </div>
        <div className="kpi-card">
          <span>目标秩序</span>
          <strong>{targetZhixu?.title ?? "暂无"}</strong>
        </div>
      </div>

      {state.status === "ready" ? (
        <section className="panel-card">
          <div className="panel-heading">
            <div>
              <h2>{state.session.sessionId}</h2>
              <p>{state.session.validation.ok ? "试拼校验通过" : "试拼仍需调整信号映射"}</p>
            </div>
            <span className={`status-badge ${state.session.validation.ok ? "success" : "warning"}`}>
              <ShieldCheck /> {state.session.status}
            </span>
          </div>
        </section>
      ) : null}

      {state.status === "error" ? (
        <div className="runtime-banner is-mock">
          <AlertTriangle />
          <div>
            <strong>试拼失败</strong>
            <p>{state.message}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
