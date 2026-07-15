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
  readonly initialSourceZhixuId?: string | undefined;
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

      <div className="store-docking-layout">
        <section className="panel-card store-docking-main">
          <div className="store-panel-label">3. 试拼沙箱</div>
          <div className="store-docking-pair">
            <div className="kpi-card">
              <span>来源秩序</span>
              <strong>{sourceZhixu?.title ?? "暂无"}</strong>
              <small>{sourceZhixu?.versionLabel ?? "无版本"} · {sourceZhixu?.planPublication.label ?? "无发布状态"}</small>
            </div>
            <div className="store-docking-arrow" aria-hidden="true">→</div>
            <div className="kpi-card">
              <span>目标秩序</span>
              <strong>{targetZhixu?.title ?? "暂无"}</strong>
              <small>{targetZhixu?.versionLabel ?? "无版本"} · {targetZhixu?.planPublication.label ?? "无发布状态"}</small>
            </div>
          </div>
          <div className="store-access-note compact">
            <ShieldCheck />
            <span>试拼草稿不发布、不创建订单、不创建 order-level signal 授权。</span>
          </div>
        </section>

        <aside className="panel-card store-docking-side">
          <div className="store-panel-label">4. 验证结果</div>
          {state.status === "ready" ? (
            <div className="store-docking-result">
              <div className="panel-heading compact">
                <div>
                  <h2>{state.session.sessionId}</h2>
                  <p>{state.session.validation.ok ? "试拼校验通过" : "试拼仍需调整信号映射"}</p>
                </div>
                <span className={`status-badge ${state.session.validation.ok ? "success" : "warning"}`}>
                  <ShieldCheck /> {state.session.status}
                </span>
              </div>
              <div className="store-check-list">
                <span><ShieldCheck /> 候选映射：{state.session.candidateMappings.length}</span>
                <span><ShieldCheck /> 草稿映射：{state.session.draftSignalMap.length}</span>
                <span><ShieldCheck /> 阻断项：{state.session.validation.errors.length}</span>
              </div>
            </div>
          ) : (
            <div className="store-docking-result empty">
              <strong>尚未创建试拼会话</strong>
              <p>创建后会显示候选映射、草稿映射和验证阻断项；结果只属于沙箱。</p>
            </div>
          )}
        </aside>
      </div>

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
