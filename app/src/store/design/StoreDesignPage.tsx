import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  GitBranch,
  Layers3,
  Loader2,
  Paintbrush,
  RefreshCw,
  Save,
  ShieldCheck,
  UploadCloud,
  Users,
  Wand2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { StoreProductSchemaDTO } from "@uvp-eth/product-dto";
import { readableStoreError, type StoreApiClient } from "../api";
import { StoreDesignDetail } from "./StoreDesignDetail";
import { StoreDockingPage } from "../docking/StoreDockingPage";
import type {
  StoreAccessState,
  StoreZhixuDraftDTO,
  StoreZhixuDraftSourceKind,
  StoreZhixuDraftStatus,
  StoreZhixuSearchResultDTO
} from "../types";
import { isRecord, shortHash } from "../../lib/frontend";

type DesignMode = "authoring" | "detail" | "docking";

type ActionPhase = "idle" | "pending" | "success" | "error";

interface ActionState {
  readonly phase: ActionPhase;
  readonly message?: string;
}

interface ImportDraftFormState {
  readonly sourceKind: StoreZhixuDraftSourceKind;
  readonly title: string;
  readonly maintainer: string;
  readonly publicSummary: string;
  readonly tagsText: string;
  readonly content: string;
}

const initialImportDraftForm: ImportDraftFormState = {
  sourceKind: "zhixu_yaml",
  title: "",
  maintainer: "",
  publicSummary: "",
  tagsText: "",
  content: ""
};

const REVIEW_DRAFT_ID_STORAGE_KEY = "uvp-store-review-draft-id";

export function StoreDesignPage({
  access,
  api,
  catalog,
  catalogError,
  onRefreshCatalog
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly catalog?: StoreZhixuSearchResultDTO | undefined;
  readonly catalogError?: string | undefined;
  readonly onRefreshCatalog: () => Promise<StoreZhixuSearchResultDTO | undefined>;
}) {
  const [mode, setMode] = useState<DesignMode>("authoring");
  const [selectedZhixuId, setSelectedZhixuId] = useState<string | undefined>();
  const [importAction, setImportAction] = useState<ActionState>({ phase: "idle" });
  const [schemaAction, setSchemaAction] = useState<ActionState>({ phase: "idle" });
  const [importForm, setImportForm] = useState<ImportDraftFormState>(initialImportDraftForm);
  const [reviewDraft, setReviewDraft] = useState<StoreZhixuDraftDTO | undefined>();
  const [productSchema, setProductSchema] = useState<StoreProductSchemaDTO | undefined>();
  const [schemaText, setSchemaText] = useState("");
  const [refreshAction, setRefreshAction] = useState<ActionState>({ phase: "idle" });


  useEffect(() => {
    if (!reviewDraft) {
      return;
    }
    try {
      window.sessionStorage.setItem(REVIEW_DRAFT_ID_STORAGE_KEY, reviewDraft.draftId);
    } catch {
    }
  }, [reviewDraft]);

  useEffect(() => {
    let storedDraftId: string | undefined;
    try {
      storedDraftId = window.sessionStorage.getItem(REVIEW_DRAFT_ID_STORAGE_KEY) ?? undefined;
    } catch {
      return;
    }
    if (!storedDraftId) {
      return;
    }
    let cancelled = false;
    void api.getZhixuDraft(storedDraftId).then((result) => {
      if (cancelled) {
        return;
      }
      setReviewDraft(result.data.draft);
      setProductSchema(result.data.draft.productSchema);
      setSchemaText(result.data.draft.productSchema ? prettySchema(result.data.draft.productSchema) : "");
      setImportAction({ phase: "success", message: "已从服务端恢复本会话在审的草稿" });
    }).catch(() => {
      if (cancelled) {
        return;
      }
      try {
        window.sessionStorage.removeItem(REVIEW_DRAFT_ID_STORAGE_KEY);
      } catch {
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zhixus = catalog?.zhixus ?? [];
  const schemaLocked = reviewDraft ? isSchemaLockedStatus(reviewDraft.status) : false;
  const draftProjection = reviewDraft?.zhixuId
    ? zhixus.find((zhixu) => zhixu.zhixuId === reviewDraft.zhixuId)
    : undefined;
  const draftOrderCreatable = draftProjection?.lifecycleStatus === "active";

  async function handleRefreshCatalog(): Promise<void> {
    if (refreshAction.phase === "pending") {
      return;
    }
    setRefreshAction({ phase: "pending", message: "正在刷新 Store 可见秩序" });
    try {
      await onRefreshCatalog();
      setRefreshAction({ phase: "idle" });
    } catch (error) {
      setRefreshAction({ phase: "error", message: readableStoreError(error, "秩序清单刷新失败") });
    }
  }

  async function handleImportDraft(): Promise<void> {
    const content = importForm.content.trim();
    if (!content) {
      setImportAction({ phase: "error", message: "请先粘贴 Zhixu YAML 或 on-chain HookPlan manifest 内容；不会发送空导入请求。" });
      return;
    }
    setImportAction({ phase: "pending", message: "正在调用 Store 导入接口" });
    try {
      const tags = importForm.tagsText
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      const result = await api.importZhixuDraft({
        sourceKind: importForm.sourceKind,
        content,
        ...(importForm.title.trim() ? { title: importForm.title.trim() } : {}),
        ...(importForm.maintainer.trim() ? { maintainer: importForm.maintainer.trim() } : {}),
        ...(importForm.publicSummary.trim() ? { publicSummary: importForm.publicSummary.trim() } : {}),
        ...(tags.length > 0 ? { tags } : {})
      });
      setReviewDraft(result.data.draft);
      setProductSchema(result.data.draft.productSchema);
      setSchemaText(result.data.draft.productSchema ? prettySchema(result.data.draft.productSchema) : "");
      setImportAction({ phase: "success", message: "导入草稿已创建；尚未编译、审核或发布" });
      setImportForm(initialImportDraftForm);
    } catch (error) {
      setImportAction({ phase: "error", message: readableStoreError(error, "导入失败") });
    }
  }

  async function handleCompileDraft(): Promise<void> {
    if (!reviewDraft) {
      return;
    }
    setSchemaAction({ phase: "pending", message: "正在编译草稿并生成能力插件建议" });
    try {
      const compiled = await api.compileZhixuDraft(reviewDraft.draftId);
      setReviewDraft(compiled.data.draft);
      const schema = compiled.data.draft.productSchema ?? (await api.getDraftProductSchema(reviewDraft.draftId)).data;
      setProductSchema(schema);
      setSchemaText(prettySchema(schema));
      setSchemaAction({ phase: "success", message: "已进入 capability-review；inferred 插件仍会阻断发布" });
    } catch (error) {
      setSchemaAction({ phase: "error", message: readableStoreError(error, "编译失败") });
    }
  }

  async function handleValidateSchema(): Promise<void> {
    if (!reviewDraft) {
      return;
    }
    setSchemaAction({ phase: "pending", message: "正在校验 Product Schema Bundle" });
    try {
      const parsed = parseSchemaText(schemaText, productSchema);
      const result = await api.validateDraftProductSchema(reviewDraft.draftId, parsed);
      setProductSchema(parsed ? { ...parsed, validation: result.data.validation } : productSchema);
      setSchemaAction({
        phase: result.data.validation.ok ? "success" : "error",
        message: result.data.validation.ok
          ? "schema 已通过发布前校验"
          : `${result.data.validation.issues.length} 个阻断项`
      });
    } catch (error) {
      setSchemaAction({ phase: "error", message: readableStoreError(error, "schema 校验失败") });
    }
  }

  async function handleSaveSchema(): Promise<void> {
    if (!reviewDraft) {
      return;
    }
    setSchemaAction({ phase: "pending", message: "正在保存 Product Schema Bundle" });
    try {
      const parsed = parseSchemaText(schemaText, productSchema);
      if (!parsed) {
        throw new Error("当前没有可保存的 schema");
      }
      const result = await api.updateDraftProductSchema(reviewDraft.draftId, parsed);
      setReviewDraft(result.data.draft);
      setProductSchema(result.data.productSchema);
      setSchemaText(prettySchema(result.data.productSchema));
      setSchemaAction({
        phase: result.data.validation.ok ? "success" : "error",
        message: result.data.validation.ok
          ? "schema 已保存并显式可发布"
          : `${result.data.validation.issues.length} 个阻断项仍需处理`
      });
    } catch (error) {
      setSchemaAction({ phase: "error", message: readableStoreError(error, "schema 保存失败") });
    }
  }




  async function handleSubmitReview(): Promise<void> {
    if (!reviewDraft) {
      return;
    }
    let parsed: StoreProductSchemaDTO | undefined;
    try {
      parsed = parseSchemaText(schemaText, productSchema);
    } catch {
      setSchemaAction({ phase: "error", message: "当前 JSON 编辑内容无法解析；请修正后先保存，再提交审核" });
      return;
    }
    if (!parsed || !productSchema || !schemaContentEquals(parsed, productSchema)) {
      setSchemaAction({ phase: "error", message: "编辑器中的 schema 尚未保存；请先点击「保存」，再提交审核" });
      return;
    }
    setSchemaAction({ phase: "pending", message: "正在提交 Store 审核" });
    try {
      const validation = await api.validateDraftProductSchema(reviewDraft.draftId, parsed);
      if (!validation.data.validation.ok) {
        setSchemaAction({ phase: "error", message: `当前 schema 仍有 ${validation.data.validation.issues.length} 个阻断项，处理后才可提交审核` });
        return;
      }
      const result = await api.submitZhixuDraftReview(reviewDraft.draftId);
      setReviewDraft(result.data.draft);
      setSchemaAction({ phase: "success", message: `已提交 Store 审核，当前草稿状态：${result.data.draft.status}；审核结论由服务端治理流程给出。` });
    } catch (error) {
      setSchemaAction({ phase: "error", message: readableStoreError(error, "提交审核失败") });
    }
  }

  if (mode === "detail" && selectedZhixuId) {
    return (
      <StoreDesignDetail
        access={access}
        api={api}
        zhixuId={selectedZhixuId}
        onBack={() => setMode("authoring")}
      />
    );
  }

  if (mode === "docking") {
    return (
      <section className="page-shell" data-testid="store-design-docking">
        <button className="back-line" onClick={() => setMode("authoring")} type="button">返回设计台</button>
        <StoreDockingPage
          access={access}
          api={api}
          initialSourceZhixuId={selectedZhixuId}
          zhixus={zhixus}
        />
      </section>
    );
  }

  return (
    <section className="page-shell store-console-page" data-testid="store-design-page">
      <div className="page-title-row">
        <div>
          <h2><Paintbrush /> 设计</h2>
          <p>写秩序、装修、发布。入口只有链接；这里不提供目录、检索或公开上架。</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" disabled={refreshAction.phase === "pending"} onClick={() => void handleRefreshCatalog()} type="button">
            {refreshAction.phase === "pending" ? <Loader2 className="spin" /> : <RefreshCw />} 刷新秩序清单
          </button>
          {access.canWrite ? (
            <button className="secondary-button" data-testid="store-open-docking-button" onClick={() => setMode("docking")} type="button">
              <GitBranch /> 试拼沙箱
            </button>
          ) : null}
        </div>
      </div>

      <div className="store-dashboard-grid">
        <div className="store-dashboard-main">
          <section className="panel-card store-catalog-panel" aria-labelledby="store-design-list-title">
            <div className="panel-heading compact">
              <div>
                <span className="store-section-kicker">设计对象</span>
                <h2 id="store-design-list-title">Store 可见秩序</h2>
                <p>选择一份秩序进入设计详情（装修、角色/插槽、版本边界）；这不是对外的秩序目录。</p>
              </div>
            </div>

            {catalogError ? (
              <div className="state-panel error" role="alert">
                <span><AlertTriangle /></span>
                <div>
                  <h2>秩序清单加载失败</h2>
                  <p>{catalogError}</p>
                </div>
              </div>
            ) : null}

            {!catalogError && !catalog ? (
              <p className="muted"><Loader2 className="spin" /> 正在读取 Store 可见秩序…</p>
            ) : null}

            {catalog ? (
              catalog.zhixus.length === 0 ? (
                <div className="inline-empty">Store 里还没有可见秩序。先用右侧导入草稿并完成发布。</div>
              ) : (
                <div className="store-table" role="table" aria-label="Store 可见秩序">
                  <div className="store-table-head" role="row">
                    <span>秩序</span>
                    <span>生命周期</span>
                    <span>发布</span>
                    <span>阶段 / 角色</span>
                    <span>动作</span>
                  </div>
                  {catalog.zhixus.map((zhixu) => (
                    <article className="store-table-row" key={zhixu.zhixuId} role="row">
                      <div>
                        <strong>{zhixu.title}</strong>
                        <p>{zhixu.subtitle}</p>
                        <small>{zhixu.maintainer} · {zhixu.versionLabel}</small>
                      </div>
                      <StatusBadge tone={statusTone(zhixu.lifecycleStatus)}>{zhixu.lifecycleLabel}</StatusBadge>
                      <span>{zhixu.planPublication.label}</span>
                      <span>{zhixu.stageCount} / {zhixu.roleSlotCount}</span>
                      <button
                        className="secondary-button"
                        data-testid="store-open-zhixu-button"
                        onClick={() => {
                          setSelectedZhixuId(zhixu.zhixuId);
                          setMode("detail");
                        }}
                        type="button"
                      >
                        打开设计
                      </button>
                    </article>
                  ))}
                </div>
              )
            ) : null}
            <ActionNotice state={refreshAction} />
          </section>

          <section className="panel-card store-schema-panel" data-testid="store-schema-review">
            <div className="panel-heading">
              <div>
                <span className="store-section-kicker">发布</span>
                <h2>能力插件审查与发布</h2>
                <p>
                  {reviewDraft
                    ? `${reviewDraft.zhixuDisplay ?? reviewDraft.title} · ${reviewDraft.status} · ${reviewDraft.draftId}`
                    : "导入草稿后在这里编译、逐条确认插件、保存并提交审核。"}
                </p>
              </div>
              {access.canWrite && reviewDraft ? (
                <div className="button-row store-toolbar-actions">
                  <button className="secondary-button" disabled={schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleCompileDraft()} type="button">
                    {schemaAction.phase === "pending" ? <Loader2 className="spin" /> : <Wand2 />} 编译预览
                  </button>
                  <button className="secondary-button" disabled={!productSchema || schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleValidateSchema()} type="button">
                    <ClipboardCheck /> 校验
                  </button>
                  <button className="secondary-button" disabled={!productSchema || schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleSaveSchema()} type="button">
                    <Save /> 保存
                  </button>
                  <button className="primary-button" disabled={!productSchema?.validation.ok || schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleSubmitReview()} type="button">
                    <FileCheck2 /> 提交审核
                  </button>
                </div>
              ) : null}
            </div>

            {!access.canWrite ? <StoreReadOnlyPlaceholder access={access} /> : null}

            {access.canWrite && !reviewDraft ? (
              <div className="inline-empty">还没有在审草稿：用右侧「导入秩序草稿」创建 Store 草稿。</div>
            ) : null}

            {access.canWrite && reviewDraft ? (
              <>
                {schemaLocked ? (
                  <div className="store-access-note compact" data-testid="store-schema-locked-note">
                    <ShieldCheck />
                    <span>{schemaLockedNote(reviewDraft.status)}</span>
                  </div>
                ) : null}

                {productSchema ? (
                  <>
                    <div className="schema-review-grid">
                      <SummaryItem icon={<Layers3 />} label="阶段" title={`${productSchema.stages.length} 个`} />
                      <SummaryItem icon={<Users />} label="插槽" title={`${productSchema.roleSlots.length} 个`} />
                      <SummaryItem icon={<ClipboardCheck />} label="schema" title={shortHash(productSchema.schemaHash, { prefixLength: 8, suffixLength: 8 })} />
                      <SummaryItem
                        icon={productSchema.validation.ok ? <CheckCircle2 /> : <AlertTriangle />}
                        label="校验"
                        title={productSchema.validation.ok ? "explicit" : `${productSchema.validation.issues.length} 阻断`}
                        tone={productSchema.validation.ok ? "success" : "warning"}
                      />
                    </div>
                    <div className="schema-slot-list" data-testid="store-schema-slot-list">
                      {productSchema.roleSlots.map((slot) => (
                        <article className="schema-slot-row" key={slot.slotId}>
                          <div>
                            <strong>{slot.performanceSlotLabel ?? slot.label}</strong>
                            <p>{slot.businessPersonaLabels?.join("、") || slot.duty}</p>
                            <small>配置不再声明 capability 插件</small>
                          </div>
                        </article>
                      ))}
                    </div>
                    {productSchema.validation.issues.length > 0 ? (
                      <div className="schema-blocker-list">
                        {productSchema.validation.issues.map((issue, index) => (
                          <p key={`${issue.code}-${index}`}>
                            <AlertTriangle /> {issue.code}: {issue.message}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <label className="field schema-json-editor" data-testid="store-schema-textarea-label">
                      <span>Product Schema Bundle JSON</span>
                      <textarea value={schemaText} onChange={(event) => setSchemaText(event.target.value)} />
                    </label>
                  </>
                ) : (
                  <div className="inline-empty">草稿已导入，点击“编译预览”生成 Product Schema Bundle。</div>
                )}

                <ActionNotice state={schemaAction} testId="store-schema-action-notice" />
                <DraftGovernancePanel
                  draft={reviewDraft}
                  orderCreatable={draftOrderCreatable}
                  onRefreshCatalog={onRefreshCatalog}
                />
              </>
            ) : null}
          </section>
        </div>

        <aside className="panel-card store-import-panel store-import-side" aria-labelledby="store-import-title">
          <div className="store-panel-label">导入</div>
          {access.canWrite ? (
            <>
              <div className="panel-heading compact">
                <div>
                  <h2 id="store-import-title">导入秩序草稿</h2>
                  <p>导入只创建 Store 草稿，不编译、不审核、不发布。</p>
                </div>
              </div>
              <div className="form-grid store-import-form">
                <label className="field">
                  <span>来源类型</span>
                  <select
                    value={importForm.sourceKind}
                    onChange={(event) => setImportForm((current) => ({
                      ...current,
                      sourceKind: event.target.value === "onchain_hook_plan_manifest" ? "onchain_hook_plan_manifest" : "zhixu_yaml"
                    }))}
                  >
                    <option value="zhixu_yaml">Zhixu YAML</option>
                    <option value="onchain_hook_plan_manifest">On-chain HookPlan Manifest</option>
                  </select>
                </label>
                <label className="field">
                  <span>标题</span>
                  <input
                    onChange={(event) => setImportForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="可选"
                    value={importForm.title}
                  />
                </label>
                <label className="field">
                  <span>维护方</span>
                  <input
                    onChange={(event) => setImportForm((current) => ({ ...current, maintainer: event.target.value }))}
                    placeholder="可选"
                    value={importForm.maintainer}
                  />
                </label>
                <label className="field">
                  <span>标签</span>
                  <input
                    onChange={(event) => setImportForm((current) => ({ ...current, tagsText: event.target.value }))}
                    placeholder="逗号分隔，可选"
                    value={importForm.tagsText}
                  />
                </label>
                <label className="field">
                  <span>公开摘要</span>
                  <input
                    onChange={(event) => setImportForm((current) => ({ ...current, publicSummary: event.target.value }))}
                    placeholder="可选"
                    value={importForm.publicSummary}
                  />
                </label>
                <label className="field">
                  <span>内容<em>*</em></span>
                  <textarea
                    onChange={(event) => setImportForm((current) => ({ ...current, content: event.target.value }))}
                    placeholder="粘贴 Zhixu YAML 或 on-chain HookPlan manifest JSON"
                    value={importForm.content}
                  />
                </label>
              </div>
              <div className="store-access-note compact">
                <ShieldCheck />
                <span>导入内容只作为 Store 元数据草稿，不会发布 Plan 或创建身份绑定。</span>
              </div>
              <div className="store-inline-actions store-import-actions">
                <button
                  className="primary-button"
                  data-testid="store-import-draft-button"
                  disabled={importAction.phase === "pending"}
                  onClick={() => void handleImportDraft()}
                  type="button"
                >
                  {importAction.phase === "pending" ? <Loader2 className="spin" /> : <UploadCloud />}
                  导入为 Store 元数据
                </button>
              </div>
              <ActionNotice state={importAction} testId="store-import-action-notice" />
            </>
          ) : (
            <StoreBoundaryCard
              icon={<ShieldCheck />}
              title="只读会话"
              text="当前访问不显示导入、编译、保存或提交审核入口。"
            />
          )}
        </aside>
      </div>
    </section>
  );
}

function DraftGovernancePanel({
  draft,
  orderCreatable,
  onRefreshCatalog
}: {
  readonly draft: StoreZhixuDraftDTO;
  readonly orderCreatable: boolean;
  readonly onRefreshCatalog: () => Promise<StoreZhixuSearchResultDTO | undefined>;
}) {
  const [refreshAction, setRefreshAction] = useState<ActionState>({ phase: "idle" });

  async function handleRefresh(): Promise<void> {
    if (refreshAction.phase === "pending") {
      return;
    }
    setRefreshAction({ phase: "pending", message: "正在刷新 Store 可见秩序" });
    try {
      await onRefreshCatalog();
      setRefreshAction({ phase: "idle" });
    } catch (error) {
      setRefreshAction({ phase: "error", message: readableStoreError(error, "秩序清单刷新失败") });
    }
  }

  return (
    <section className="governance-publish-card" data-testid="store-governance-publishing">
      <div className="governance-publish-head">
        <div>
          <h3>发布状态</h3>
          <p data-testid="store-governance-heading">Store 审核完成后，由发布工具把 Plan 注册到 UVPStateMachine。</p>
        </div>
        <span className={`status-badge ${orderCreatable ? "success" : "info"}`} data-testid="store-governance-status">
          {draft.status}
        </span>
      </div>

      <div className={`governance-state-note ${orderCreatable ? "success" : "info"}`} data-testid="store-governance-state-note" data-state={draft.status}>
        {orderCreatable ? <CheckCircle2 /> : <ClipboardCheck />}
        <div>
          <strong>{orderCreatable ? "版本已激活" : "等待发布"}</strong>
          <p data-testid="store-governance-description">
            {orderCreatable
              ? "链上投影显示该版本已激活、可创建订单；PlanRegistered 的最终索引状态以链上投影为准。"
              : "当前草稿仍处于 Store 工作流中，或秩序清单投影尚未观察到激活（可能仍在索引）；发布工具负责链上注册。"}
          </p>
        </div>
      </div>

      <div className="button-row">
        <button
          className="secondary-button"
          data-testid="store-refresh-catalog-button"
          disabled={refreshAction.phase === "pending"}
          onClick={() => void handleRefresh()}
          type="button"
        >
          {refreshAction.phase === "pending" ? <Loader2 className="spin" /> : <Layers3 />}
          刷新秩序清单{orderCreatable ? "" : "（检查索引进度）"}
        </button>
      </div>
      <ActionNotice state={refreshAction} testId="store-refresh-catalog-notice" />
    </section>
  );
}


function ActionNotice({ state, testId }: { readonly state: ActionState; readonly testId?: string | undefined }) {
  if (state.phase === "idle") {
    return null;
  }
  const icon = state.phase === "pending"
    ? <Loader2 className="spin" />
    : state.phase === "success"
      ? <CheckCircle2 />
      : <AlertTriangle />;
  return (
    <div className={`action-notice ${state.phase}`} data-testid={testId} data-phase={state.phase}>
      {icon}
      <span>{state.message}</span>
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  title,
  tone
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly title: string;
  readonly tone?: "success" | "warning" | undefined;
}) {
  return (
    <div className={`summary-item ${tone ?? ""}`}>
      {icon}
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
      </div>
    </div>
  );
}

function StatusBadge({ children, tone }: { readonly children: string; readonly tone: "success" | "warning" | "info" | "default" }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

function StoreBoundaryCard({
  icon,
  title,
  text
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly text: string;
}) {
  return (
    <div className="store-boundary-card">
      {icon}
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function StoreReadOnlyPlaceholder({ access }: { readonly access: StoreAccessState }) {
  return (
    <section className="panel-card store-schema-empty">
      <div className="schema-empty-grid">
        <StoreBoundaryCard
          icon={<ClipboardCheck />}
          title="Product Schema Bundle"
          text="阶段、权限、凭证资源和插件来源在这里审查；inferred 不能直接发布。"
        />
        <StoreBoundaryCard
          icon={<ShieldCheck />}
          title="StateMachine 发布"
          text="审核通过后，由发布工具注册 Plan；索引确认后状态转为 active。"
        />
        <StoreBoundaryCard
          icon={<Users />}
          title={access.canWrite ? "可导入草稿" : "只读模式"}
          text={access.canWrite ? "使用右侧导入面板创建 Store 草稿。" : "只读访问不会显示导入、保存或治理写入口。"}
        />
      </div>
    </section>
  );
}

function statusTone(status: string): "success" | "warning" | "info" | "default" {
  if (status === "active" || status === "published") {
    return "success";
  }
  if (status === "revoked" || status === "rejected" || status === "compile_failed") {
    return "warning";
  }
  if (status === "approved_for_broadcast" || status === "submitted_for_review" || status === "compiled") {
    return "info";
  }
  return "default";
}

function isSchemaLockedStatus(status: StoreZhixuDraftStatus): boolean {
  return status === "approved_for_broadcast" ||
    status === "active" ||
    status === "rejected" ||
    status === "revoked";
}

function schemaLockedNote(status: StoreZhixuDraftStatus): string {
  switch (status) {
    case "rejected":
      return "草稿在 Store 审核中被驳回：schema 编辑与提交审核入口已锁定；如需继续，请重新导入新草稿。";
    case "revoked":
      return "草稿已被撤销：schema 已冻结；如需继续，请重新导入新草稿。";
    case "approved_for_broadcast":
      return "草稿已通过审核并进入发布流程：schema 已冻结，不可再编辑或重复提交审核。";
    case "active":
      return "草稿对应版本已在链上投影中激活：schema 已冻结，不可再编辑或重复提交审核。";
    default:
      return "草稿处于锁定状态：schema 编辑入口不可用。";
  }
}

function prettySchema(schema: StoreProductSchemaDTO): string {
  return JSON.stringify(schema, null, 2);
}

function parseSchemaText(
  schemaText: string,
  fallback: StoreProductSchemaDTO | undefined
): StoreProductSchemaDTO | undefined {
  const trimmed = schemaText.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("schema JSON must be an object");
  }
  return parsed as unknown as StoreProductSchemaDTO;
}

function schemaContentEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalSchemaValue(left)) === JSON.stringify(canonicalSchemaValue(right));
}

function canonicalSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalSchemaValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalSchemaValue(value[key])])
    );
  }
  return value;
}
