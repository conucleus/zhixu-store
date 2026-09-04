import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleDashed,
  GitBranch,
  Loader2,
  Puzzle,
  ShieldCheck,
  Tags,
  Truck,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import { StoreAnchorPanel, joinEntrySuppressed, joinSuppressionReason } from "./StoreAnchorPanel";
import { StoreDecorationEditor } from "./StoreDecorationEditor";
import { StoreJoinEntry } from "./StoreJoinEntry";
import type { CapabilityPluginSource, StoreCapabilityReviewStatus, StoreZhixuDetailDTO } from "@uvp-eth/product-dto";
import type { StoreAccessState, StoreZhixuOverlayView } from "./types";
import { shortValue } from "../shared/frontend";

type DetailState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly zhixu: StoreZhixuDetailDTO; readonly overlay?: StoreZhixuOverlayView | undefined }
  | { readonly status: "error"; readonly message: string };

export function StoreZhixuDetailPage({
  access,
  api,
  zhixuId,
  onBack,
  onOpenDocking,
  onOpenJoinForPlan
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly zhixuId: string;
  readonly onBack: () => void;
  readonly onOpenDocking: () => void;
  readonly onOpenJoinForPlan: (planId: string) => void;
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
    return <StatePanel icon={<Loader2 className="spin" />} title="正在加载秩序详情" desc={zhixuId} />;
  }

  if (state.status === "error") {
    return <StatePanel icon={<AlertTriangle />} title="秩序详情加载失败" desc={state.message} tone="error" />;
  }

  const zhixu = state.zhixu;
  const overlay = state.overlay;
  const stageTitleById = new Map(zhixu.stages.map((stage) => [stage.stageId, stage.title]));
  const slotReviewSummary = summarizeSlotReviews(zhixu.roleSlots);
  const suppressionReason = joinSuppressionReason(overlay?.anchorVerification, overlay?.listing);
  const joinSuppressed = joinEntrySuppressed(overlay?.anchorVerification, overlay?.listing);
  const reloadDetail = () => {
    void api.getZhixuDetailWithOverlay(zhixuId).then((result) => {
      setState({ status: "ready", zhixu: result.data.zhixu, ...(result.data.overlay ? { overlay: result.data.overlay } : {}) });
    }).catch(() => {
      // 刷新失败保留当前视图。
    });
  };
  const decorationTheme = overlay?.decoration?.current?.data.theme;
  return (
    <section className="page-shell" data-testid="store-zhixu-detail-page" data-anchor-status={overlay?.anchorVerification?.status ?? "unknown"}>
      <button className="back-line" onClick={onBack}><ChevronLeft /> 返回秩序检索</button>

      {suppressionReason ? (
        <div className="store-suppression-banner" role="alert" data-testid="store-suppression-banner">
          <AlertTriangle />
          <div>
            <strong>{overlay?.anchorVerification?.status === "conflict" ? "listing 与链上事实冲突" : "该秩序已下架"}</strong>
            <p>{suppressionReason}</p>
          </div>
        </div>
      ) : null}

      <div className="store-detail-grid">
        <section className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="store-section-kicker">跨境电商履约秩序</span>
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
              <h3>角色/能力审查</h3>
              <span>{slotReviewSummary.label}</span>
            </div>
            <div className="store-role-matrix-grid">
              {zhixu.roleSlots.slice(0, 4).map((slot) => (
                <div className={`store-role-matrix-row ${slotReviewTone(slot.capabilityReviewStatus)}`} key={slot.roleSlotId}>
                  <strong>{slot.performanceSlotLabel}</strong>
                  <span>{slot.capabilityReviewLabel}</span>
                  <small>{slot.expectedEvidence.slice(0, 2).join("、") || "未声明凭证"}</small>
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
          <section className="side-panel">
            <div className="side-panel-title">
              <h3>下一步</h3>
            </div>
            <div className="quick-order-card">
              <strong>{zhixu.nextAction}</strong>
              <span>链上运行事实来自 UVPStateMachine 投影。</span>
            </div>
            {access.canWrite ? (
              <button className="primary-button block" onClick={onOpenDocking}><GitBranch /> 试拼对接</button>
            ) : (
              <div className="store-access-note compact">
                <ShieldCheck />
                <span>只读访问不显示试拼保存、导入和版本操作。</span>
              </div>
            )}
          </section>

          <StoreAnchorPanel verification={overlay?.anchorVerification} listing={overlay?.listing} />

          {joinSuppressed ? null : (
            <StoreJoinEntry
              access={access}
              api={api}
              planId={zhixu.planId}
              roleSlots={zhixu.roleSlots.map((slot) => ({ slotId: slot.roleSlotId, title: slot.title }))}
              stageIds={zhixu.stages.map((stage) => stage.stageId)}
              onSubmitted={() => onOpenJoinForPlan(zhixu.planId)}
            />
          )}

          <StoreDecorationEditor
            access={access}
            api={api}
            planId={zhixu.planId}
            decoration={overlay?.decoration}
            viewerIsPublisher={overlay?.viewerPermission?.viewerIsPublisher ?? false}
            viewerIsDelegate={(overlay?.viewerPermission?.viewerActiveDelegations ?? []).length > 0}
            onChanged={reloadDetail}
          />

          {overlay?.viewerPermission?.viewerActiveDelegations && overlay.viewerPermission.viewerActiveDelegations.length > 0 ? (
            <p className="muted store-delegation-hint">当前会话经发布者委托获得该秩序的装修/加入审核权。</p>
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
                  <p>当前版本的 PlanRegistered 事件已被索引，可创建订单。Store 目录的“可创建订单”标签表示该信号容器已发布。</p>
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

          {access.canAdmin ? (
            <section className="side-panel">
              <div className="side-panel-title">
                <h3>治理边界</h3>
              </div>
              <div className="plain-help-box">
                <ShieldCheck />
                <div>
                  <strong>身份登记与撤销走 Admin Governance</strong>
                  <p>Store 的目录资料不能代替 Identity Registry 的主体—账户绑定。</p>
                </div>
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="store-slot-review-section" aria-label="履约插槽能力审查">
        <div className="store-slot-review-head">
          <div>
            <span className="store-section-kicker"><Puzzle /> 履约插槽</span>
            <h2>能力插件审查</h2>
            <p>Store 操作员检查每个责任位置的业务身份、覆盖阶段和已安装能力；订单提交动作仍在订单工作台完成。</p>
          </div>
          <span className={`status-badge ${slotReviewTone(slotReviewSummary.status)}`}>{slotReviewSummary.label}</span>
        </div>

        <div className="store-slot-grid">
          {zhixu.roleSlots.map((slot) => (
            <article className={`store-slot-card ${slotReviewTone(slot.capabilityReviewStatus)}`} key={slot.roleSlotId}>
              <div className="store-slot-card-head">
                <div>
                  <span className="store-slot-id">插槽 {slot.roleSlotId}</span>
                  <h3>{slot.performanceSlotLabel}</h3>
                  <p>{slot.title} · {slot.required ? "必需" : "可选"} · {slot.statusLabel}</p>
                </div>
                <span className={`status-badge ${slotReviewTone(slot.capabilityReviewStatus)}`}>
                  {slotReviewIcon(slot.capabilityReviewStatus)}
                  {slot.capabilityReviewLabel}
                </span>
              </div>

              <p className="store-slot-duty">{slot.description}</p>
              <TagList label="业务身份" values={slot.businessPersonaLabels} empty="未声明业务身份" />
              <TagList label="所需凭证" values={slot.expectedEvidence} empty="未声明凭证要求" />

              <div className="store-capability-list">
                {slot.capabilityPlugins.length > 0 ? slot.capabilityPlugins.map((plugin) => (
                  <div className="store-capability-row" key={`${slot.roleSlotId}:${plugin.pluginKind}:${plugin.stageIds.join(",")}`}>
                    <div className="store-capability-title">
                      <span>{capabilityKindLabel(plugin.pluginKind)}</span>
                      <strong>{plugin.title}</strong>
                    </div>
                    <p>{plugin.summary}</p>
                    <div className="store-capability-meta">
                      <span>覆盖阶段：{coveredStageLabel(plugin.stageIds, stageTitleById)}</span>
                      <span>来源：{capabilitySourceLabel(plugin.source)}</span>
                      {plugin.primaryActionLabel ? <span>动作：{plugin.primaryActionLabel}</span> : null}
                    </div>
                    <TagList label="插件凭证" values={plugin.requiredEvidence} empty="无额外凭证声明" />
                  </div>
                )) : (
                  <div className="store-slot-missing">
                    <AlertTriangle />
                    <span>该插槽还没有显式能力插件，发布前需要 Store 操作员补齐或确认迁移结果。</span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="proof-panel store-proof-panel">
        <button className="proof-toggle" onClick={() => setProofOpen((open) => !open)}>
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
  suffix: string,
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

function summarizeSlotReviews(
  slots: StoreZhixuDetailDTO["roleSlots"]
): { readonly status: StoreCapabilityReviewStatus; readonly label: string } {
  if (slots.length === 0 || slots.some((slot) => slot.capabilityReviewStatus === "missing")) {
    return { status: "missing", label: "存在缺失能力配置" };
  }
  if (slots.some((slot) => slot.capabilityReviewStatus === "inferred")) {
    return { status: "inferred", label: "存在推断待确认" };
  }
  return { status: "explicit", label: "全部显式配置" };
}

function slotReviewTone(status: StoreCapabilityReviewStatus): "success" | "warning" | "info" {
  if (status === "explicit") {
    return "success";
  }
  if (status === "missing") {
    return "warning";
  }
  return "info";
}

function slotReviewIcon(status: StoreCapabilityReviewStatus): ReactNode {
  if (status === "explicit") {
    return <CheckCircle2 />;
  }
  if (status === "missing") {
    return <AlertTriangle />;
  }
  return <CircleDashed />;
}

function capabilityKindLabel(kind: StoreZhixuDetailDTO["roleSlots"][number]["capabilityPlugins"][number]["pluginKind"]): string {
  switch (kind) {
    case "payment_placeholder":
      return "资金动作占位";
    case "evidence_submission":
      return "履约凭证";
    case "delivery_update":
      return "交付更新";
    case "validation_confirm":
      return "验收确认";
    case "dispute_material":
      return "争议材料";
  }
}

function capabilitySourceLabel(source: CapabilityPluginSource): string {
  switch (source) {
    case "explicit":
      return "显式配置";
    case "inferred":
      return "旧版本推断";
    case "missing":
      return "缺失";
  }
}

function coveredStageLabel(stageIds: readonly string[], stageTitleById: ReadonlyMap<string, string>): string {
  if (stageIds.length === 0) {
    return "未声明覆盖阶段";
  }
  return stageIds.map((stageId) => stageTitleById.get(stageId) ?? stageId).join("、");
}
