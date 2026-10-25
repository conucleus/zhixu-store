import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleDashed,
  Loader2,
  Puzzle,
  ShieldCheck,
  Tags,
  Truck,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readableStoreError, type StoreApiClient } from "../api";
import { StoreDecorationEditor } from "../authoring/StoreDecorationEditor";
import type { StoreZhixuDetailDTO } from "@uvp-eth/product-dto";
import type { StoreAccessState, StoreZhixuOverlayView } from "../types";
import { shortValue } from "../../lib/frontend";

type DetailState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly zhixu: StoreZhixuDetailDTO; readonly overlay?: StoreZhixuOverlayView | undefined }
  | { readonly status: "error"; readonly message: string };

export function StoreDesignDetail({
  access,
  api,
  zhixuId,
  onBack
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly zhixuId: string;
  readonly onBack: () => void;
}) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [proofOpen, setProofOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void api.getZhixuDetailWithOverlay(zhixuId).then((result) => {
      if (!cancelled) {
        setState({ status: "ready", zhixu: result.data.zhixu, ...(result.data.overlay ? { overlay: result.data.overlay } : {}) });
      }
    }).catch((error) => {
      if (!cancelled) {
        setState({ status: "error", message: readableStoreError(error, "秩序详情加载失败") });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, zhixuId]);

  if (state.status === "loading") {
    return <StatePanel icon={<Loader2 className="spin" />} title="正在加载秩序设计" desc={zhixuId} />;
  }

  if (state.status === "error") {
    return <StatePanel icon={<AlertTriangle />} title="秩序设计加载失败" desc={state.message} tone="error" />;
  }

  const zhixu = state.zhixu;
  const overlay = state.overlay;
  const stageTitleById = new Map(zhixu.stages.map((stage) => [stage.stageId, stage.title]));
  const reloadDetail = () => {
    void api.getZhixuDetailWithOverlay(zhixuId).then((result) => {
      setState({ status: "ready", zhixu: result.data.zhixu, ...(result.data.overlay ? { overlay: result.data.overlay } : {}) });
    }).catch(() => {
    });
  };
  const decorationTheme = overlay?.decoration?.current?.data.theme;
  return (
    <section className="page-shell" data-testid="store-design-detail-page">
      <button className="back-line" onClick={onBack} type="button"><ChevronLeft /> 返回设计台</button>

      <div className="store-detail-grid">
        <section className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="store-section-kicker">设计 · 秩序详情</span>
              <h2>{decorationTheme?.displayName ?? zhixu.title}</h2>
              <p>{decorationTheme?.description ?? zhixu.subtitle}</p>
            </div>
            <span className={`status-badge ${statusTone(zhixu.lifecycleStatus)}`}>{zhixu.lifecycleLabel}</span>
          </div>

          <div className="store-detail-id-row">
            <span>Plan ID <code>{shortValue(zhixu.planId)}</code></span>
            <span>Plan Hash <code>{shortValue(zhixu.planHash)}</code></span>
            {zhixu.artifactHash ? <span>Artifact <code>{shortValue(zhixu.artifactHash)}</code></span> : null}
          </div>

          <section className="store-lifecycle-card" aria-label="生命周期事实">
            <div className="store-mini-heading">
              <h3>生命周期事实</h3>
              <span>链上发布状态：{zhixu.planPublication.label}</span>
            </div>
            <div className="store-lifecycle-list">
              {zhixu.versionHistory.slice(0, 4).map((version) => (
                <div className="store-lifecycle-step" key={`${version.zhixuId}:${version.versionId}`}>
                  <CheckCircle2 />
                  <div>
                    <strong>{version.versionLabel}</strong>
                    <span>{version.status} · {version.publicationStatus}</span>
                  </div>
                </div>
              ))}
              {zhixu.versionHistory.length === 0 ? (
                <div className="store-lifecycle-step muted">
                  <CircleDashed />
                  <div>
                    <strong>暂无版本历史</strong>
                    <span>等待 Store 投影返回版本记录。</span>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <div className="store-fact-grid">
            <Fact label="维护方" value={zhixu.maintainer} />
            <Fact label="版本" value={zhixu.versionLabel} />
            <Fact label="风险等级" value={zhixu.riskLevel} />
            <Fact label="角色" value={`${zhixu.roleSlotCount} 类`} />
            <Fact label="阶段" value={`${zhixu.stageCount} 个`} />
            <Fact label="更新" value={zhixu.updatedAt} />
          </div>

          <div className="store-ops-row">
            <Metric icon={<ShieldCheck />} label="发布" value={zhixu.planPublication.label} />
            <Metric icon={<Truck />} label="订单" value={storeMetricValue(zhixu, "orderCount", "单")} />
            <Metric icon={<Users />} label="供应商" value={storeMetricValue(zhixu, "supplierCount", "个")} />
          </div>

          <section className="store-role-matrix" aria-label="角色与阶段配置">
            <div className="store-mini-heading">
              <h3>角色与阶段配置</h3>
            </div>
            <div className="store-role-matrix-grid">
              {zhixu.roleSlots.slice(0, 4).map((slot) => (
                <div className="store-role-matrix-row" key={slot.roleSlotId}>
                  <strong>{slot.performanceSlotLabel}</strong>
                  <span>{slot.statusLabel}</span>
                  <small>{slot.expectedEvidence.join("、") || "未声明凭证"}</small>
                </div>
              ))}
            </div>
          </section>

          <details className="store-advanced">
            <summary>高级标识</summary>
            <div className="store-code-grid">
              <Fact label="Plan ID" value={zhixu.planId} mono />
              <Fact label="Plan Hash" value={zhixu.planHash} mono />
              {zhixu.artifactHash ? <Fact label="Artifact Hash" value={zhixu.artifactHash} mono /> : null}
            </div>
          </details>
        </section>

        <aside className="right-stack">
          <StoreDecorationEditor
            access={access}
            api={api}
            planId={zhixu.planId}
            decoration={overlay?.decoration}
            viewerIsPublisher={overlay?.viewerPermission?.viewerIsPublisher ?? false}
            viewerIsDelegate={(overlay?.viewerPermission?.viewerActiveDelegations ?? []).length > 0}
            publisherAddress={overlay?.viewerPermission?.publisher}
            onChanged={reloadDetail}
          />

          {overlay?.viewerPermission?.viewerActiveDelegations && overlay.viewerPermission.viewerActiveDelegations.length > 0 ? (
            <p className="muted store-delegation-hint">当前会话经发布者委托获得该秩序的装修操作权。</p>
          ) : null}

          <section className="side-panel" data-testid="store-version-governance-boundary">
            <div className="side-panel-title">
              <h3>版本启用边界</h3>
            </div>
            <div className="plain-help-box">
              <ShieldCheck />
              <div>
                <strong>{zhixu.lifecycleReason}</strong>
                <p>{zhixu.usageGuidance}</p>
                {zhixu.lifecycleStatus === "active" && zhixu.planPublication.status === "published" ? (
                  <p>当前版本的 PlanRegistered 事件已被索引，可创建订单。</p>
                ) : (
                  <p>未发布的版本不可激活；请先完成 StateMachine Plan 注册并等待索引。</p>
                )}
              </div>
            </div>
            <div className="store-version-mini-list">
              {zhixu.versionHistory.slice(0, 3).map((version) => (
                <div className="store-version-mini-row" key={`${version.zhixuId}:${version.versionId}`}>
                  <span>{version.versionLabel}</span>
                  <strong>{version.status}</strong>
                  <small>{version.publicationStatus}</small>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="store-slot-review-section" aria-label="履约插槽">
        <div className="store-slot-review-head">
          <div>
            <span className="store-section-kicker"><Puzzle /> 履约插槽</span>
            <h2>责任位置与凭证要求</h2>
            <p>每个责任位置的业务身份与所需凭证；配置用 slots/senders 与 fileResources 句柄表达。</p>
          </div>
        </div>

        <div className="store-slot-grid">
          {zhixu.roleSlots.map((slot) => (
            <article className="store-slot-card" key={slot.roleSlotId}>
              <div className="store-slot-card-head">
                <div>
                  <span className="store-slot-id">插槽 {slot.roleSlotId}</span>
                  <h3>{slot.performanceSlotLabel}</h3>
                  <p>{slot.title} · {slot.required ? "必需" : "可选"} · {slot.statusLabel}</p>
                </div>
              </div>

              <p className="store-slot-duty">{slot.description}</p>
              <TagList label="业务身份" values={slot.businessPersonaLabels} empty="未声明业务身份" />
              <TagList label="所需凭证" values={slot.expectedEvidence} empty="未声明凭证要求" />

            </article>
          ))}
        </div>
      </section>

      <section className="proof-panel store-proof-panel">
        <button className="proof-toggle" onClick={() => setProofOpen((open) => !open)} type="button">
          <span><ShieldCheck /> 高级链上证明</span>
          <small>{zhixu.planPublication.label}</small>
          <ChevronDown className={proofOpen ? "rotate" : ""} />
        </button>
        {proofOpen ? (
          <div className="proof-details">
            {zhixu.proofSections.length > 0 ? zhixu.proofSections.map((section) => (
              <section className="store-proof-section" key={section.sectionId}>
                <div className="store-mini-heading">
                  <h3>{section.title}</h3>
                  <span>{section.sourceOfTruth}</span>
                </div>
                {section.rows.map((row) => (
                  <Fact key={`${section.sectionId}:${row.label}:${row.value}`} label={row.label} value={row.value} mono={row.label.includes("Hash") || row.label.includes("ID") || row.copyable} />
                ))}
              </section>
            )) : zhixu.proofRows.map((row) => <Fact key={row.label} label={row.label} value={row.value} mono={row.label.includes("Hash") || row.label.includes("ID")} />)}
          </div>
        ) : null}
      </section>
    </section>
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

function Fact({ label, value, mono }: { readonly label: string; readonly value: string; readonly mono?: boolean | undefined }) {
  return (
    <div className="fact-row">
      <span>{label}</span>
      <strong className={mono ? "mono-value" : ""}>{value}</strong>
    </div>
  );
}

function Metric({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="store-metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function storeMetricValue(
  zhixu: Pick<StoreZhixuDetailDTO, "metricsStatus" | "orderCount" | "openTaskCount" | "supplierCount">,
  field: "orderCount" | "openTaskCount" | "supplierCount",
  suffix: string
): string {
  if (zhixu.metricsStatus !== "observed") {
    return "未知";
  }
  return `${zhixu[field]} ${suffix}`;
}

function TagList({
  label,
  values,
  empty
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly empty: string;
}) {
  return (
    <div className="store-tag-row">
      <span><Tags /> {label}</span>
      <div>
        {values.length > 0 ? values.map((value) => <small key={value}>{value}</small>) : <em>{empty}</em>}
      </div>
    </div>
  );
}

function statusTone(status: string): "success" | "warning" | "info" | "default" {
  if (status === "active" || status === "published") {
    return "success";
  }
  if (status === "revoked" || status === "rejected") {
    return "warning";
  }
  if (status === "approved_for_broadcast" || status === "submitted_for_review" || status === "compiled") {
    return "info";
  }
  return "default";
}

function coveredStageLabel(stageIds: readonly string[], stageTitleById: ReadonlyMap<string, string>): string {
  if (stageIds.length === 0) {
    return "未声明覆盖阶段";
  }
  return stageIds.map((stageId) => stageTitleById.get(stageId) ?? stageId).join("、");
}
