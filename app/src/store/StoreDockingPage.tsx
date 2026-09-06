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
  // 目标秩序必须由操作员显式选择：不再静默取“第一个非来源秩序”，
  // 也不允许回落到来源秩序自身（自试拼没有意义且服务端暂不拒绝）。
  const [selectedTargetZhixuId, setSelectedTargetZhixuId] = useState("");
  const targetZhixu = zhixus.find((item) => item.zhixuId === selectedTargetZhixuId);
  const sameAsSource = Boolean(targetZhixu && sourceZhixu && targetZhixu.zhixuId === sourceZhixu.zhixuId);
  const [state, setState] = useState<DockingState>({ status: "idle" });

  async function createSession(): Promise<void> {
    if (!sourceZhixu) {
      setState({ status: "error", message: "缺少可试拼的秩序版本" });
      return;
    }
    if (!targetZhixu) {
      setState({ status: "error", message: "请先选择目标秩序" });
      return;
    }
    if (sameAsSource) {
      setState({ status: "error", message: "目标秩序不能与来源秩序相同：试拼需要两个不同的秩序版本" });
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
          <button
            className="primary-button"
            data-testid="store-create-docking-session-button"
            disabled={state.status === "pending" || !targetZhixu || sameAsSource}
            onClick={createSession}
          >
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
          <label className="field" style={{ marginBottom: "1rem" }}>
            <span>目标秩序<em>*</em></span>
            <div className="input-wrap">
              <select
                data-testid="store-docking-target-select"
                value={selectedTargetZhixuId}
                onChange={(event) => {
                  setSelectedTargetZhixuId(event.currentTarget.value);
                  setState({ status: "idle" });
                }}
              >
                <option value="">请选择目标秩序</option>
                {zhixus.map((zhixu) => (
                  <option key={zhixu.zhixuId} value={zhixu.zhixuId}>
                    {zhixu.title}（{zhixu.zhixuId}）
                  </option>
                ))}
              </select>
              <i aria-hidden="true">▾</i>
            </div>
          </label>
          {targetZhixu && sameAsSource ? (
            <div className="warning-box" data-testid="store-docking-same-target-warning" style={{ marginBottom: "1rem" }}>
              <AlertTriangle />
              <div>
                <strong>目标秩序与来源秩序相同</strong>
                <p>试拼需要两个不同的秩序版本，请重新选择目标秩序。</p>
              </div>
            </div>
          ) : null}
          <div className="store-docking-pair">
            <div className="kpi-card">
              <span>来源秩序</span>
              <strong>{sourceZhixu?.title ?? "暂无"}</strong>
              <small>{sourceZhixu?.versionLabel ?? "无版本"} · {sourceZhixu?.planPublication.label ?? "无发布状态"}</small>
            </div>
            <div className="store-docking-arrow" aria-hidden="true">→</div>
            <div className="kpi-card">
              <span>目标秩序</span>
              <strong>{targetZhixu?.title ?? "尚未选择"}</strong>
              <small>{targetZhixu ? `${targetZhixu.versionLabel} · ${targetZhixu.planPublication.label}` : "从上方列表选择目标秩序"}</small>
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
              <p>选择来源和目标秩序并创建会话后，这里会显示候选映射、草稿映射和验证阻断项；结果只属于沙箱。</p>
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
