import { AlertTriangle, CheckCircle2, ClipboardCheck, FileCheck2, GitBranch, Layers3, Loader2, RefreshCw, Save, Search, ShieldCheck, SlidersHorizontal, Truck, UploadCloud, Users, Wand2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { StoreProductSchemaDTO, StoreProductSchemaValidationDTO, StoreSearchType } from "@uvp-eth/product-dto";
import type { StoreZhixuConsoleDTO } from "@uvp-eth/product-dto";
import { readableStoreError, type StoreApiClient } from "./api";
import { StoreListingPanel } from "./StoreListingPanel";
import type {
  StoreAccessState,
  StoreApiResult,
  StoreImportZhixuDraftInput,
  StoreProductSchemaUpdateResultDTO,
  StoreSearchInput,
  StoreZhixuDraftDTO,
  StoreZhixuDraftReviewResultDTO,
  StoreZhixuDraftStatus,
  StoreZhixuDraftSourceKind,
  StoreZhixuSearchResultDTO
} from "./types";
import { isRecord, shortHash } from "../shared/frontend";

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

export function StoreSearchPage({
  access,
  api,
  result,
  onOpenZhixu,
  onGoDocking,
  onSearch,
  onImportDraft,
  onCompileDraft,
  onGetDraftProductSchema,
  onUpdateDraftProductSchema,
  onValidateDraftProductSchema,
  onSubmitDraftReview,
  onRefreshCatalog
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly result: StoreZhixuSearchResultDTO;
  readonly onOpenZhixu: (zhixuId: string) => void;
  readonly onGoDocking: () => void;
  readonly onSearch: (input: StoreSearchInput) => Promise<StoreZhixuSearchResultDTO>;
  readonly onImportDraft: (input: StoreImportZhixuDraftInput) => Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>>;
  readonly onCompileDraft: (draftId: string) => Promise<StoreApiResult<{ readonly draft: StoreZhixuDraftDTO }>>;
  readonly onGetDraftProductSchema: (draftId: string) => Promise<StoreApiResult<StoreProductSchemaDTO>>;
  readonly onUpdateDraftProductSchema: (
    draftId: string,
    productSchema: StoreProductSchemaDTO
  ) => Promise<StoreApiResult<StoreProductSchemaUpdateResultDTO>>;
  readonly onValidateDraftProductSchema: (
    draftId: string,
    productSchema?: StoreProductSchemaDTO
  ) => Promise<StoreApiResult<{ readonly validation: StoreProductSchemaValidationDTO }>>;
  readonly onSubmitDraftReview: (draftId: string) => Promise<StoreApiResult<StoreZhixuDraftReviewResultDTO>>;
  readonly onRefreshCatalog?: (() => Promise<StoreZhixuSearchResultDTO>) | undefined;
}) {
  const [keyword, setKeyword] = useState("");
  const [searchType, setSearchType] = useState<StoreSearchType>("all");
  const [searchAction, setSearchAction] = useState<ActionState>({ phase: "idle" });
  const [importAction, setImportAction] = useState<ActionState>({ phase: "idle" });
  const [schemaAction, setSchemaAction] = useState<ActionState>({ phase: "idle" });
  const [importForm, setImportForm] = useState<ImportDraftFormState>(initialImportDraftForm);
  const [reviewDraft, setReviewDraft] = useState<StoreZhixuDraftDTO | undefined>();
  const [productSchema, setProductSchema] = useState<StoreProductSchemaDTO | undefined>();
  const [schemaText, setSchemaText] = useState("");

  const schemaLocked = reviewDraft ? isSchemaLockedStatus(reviewDraft.status) : false;
  const summaryMetricsObserved = result.zhixus.every((zhixu) => zhixu.metricsStatus === "observed");

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) {
      setSearchAction({ phase: "pending", message: "正在恢复 Store 目录列表" });
      try {
        await onSearch({});
        setSearchAction({ phase: "idle" });
      } catch (error) {
        setSearchAction({ phase: "error", message: readableStoreError(error, "Store 搜索失败") });
      }
      return;
    }
    setSearchAction({ phase: "pending", message: "正在调用 /store/search" });
    try {
      await onSearch({ keyword: trimmed, type: searchType, limit: 20 });
      setSearchAction({ phase: "success", message: "搜索结果来自 /store/search" });
    } catch (error) {
      setSearchAction({ phase: "error", message: readableStoreError(error, "Store 搜索失败") });
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
      const result = await onImportDraft({
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
      const compiled = await onCompileDraft(reviewDraft.draftId);
      setReviewDraft(compiled.data.draft);
      const schema = compiled.data.draft.productSchema ?? (await onGetDraftProductSchema(reviewDraft.draftId)).data;
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
      const result = await onValidateDraftProductSchema(reviewDraft.draftId, parsed);
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
      const result = await onUpdateDraftProductSchema(reviewDraft.draftId, parsed);
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

  async function handleConfirmExplicitPlugins(): Promise<void> {
    if (!reviewDraft || !productSchema) {
      return;
    }
    const explicitSchema = confirmSchemaPluginsExplicit(productSchema);
    setSchemaText(prettySchema(explicitSchema));
    setSchemaAction({ phase: "pending", message: "正在确认所有插件为 explicit" });
    try {
      const result = await onUpdateDraftProductSchema(reviewDraft.draftId, explicitSchema);
      setReviewDraft(result.data.draft);
      setProductSchema(result.data.productSchema);
      setSchemaText(prettySchema(result.data.productSchema));
      setSchemaAction({
        phase: result.data.validation.ok ? "success" : "error",
        message: result.data.validation.ok
          ? "所有插件已确认 explicit，可提交 Store 审核"
          : `${result.data.validation.issues.length} 个阻断项仍需处理`
      });
    } catch (error) {
      setSchemaAction({ phase: "error", message: readableStoreError(error, "确认插件失败") });
    }
  }

  async function handleSubmitReview(): Promise<void> {
    if (!reviewDraft) {
      return;
    }
    setSchemaAction({ phase: "pending", message: "正在提交 Store 审核" });
    try {
      const result = await onSubmitDraftReview(reviewDraft.draftId);
      setReviewDraft(result.data.draft);
      setSchemaAction({ phase: "success", message: "Store 审核已通过，可以进入 StateMachine 发布流程。" });
    } catch (error) {
      setSchemaAction({ phase: "error", message: readableStoreError(error, "提交审核失败") });
    }
  }

  return (
    <section className="page-shell store-console-page" data-testid="store-search-page">

        {access.capabilities.includes("store.listing.manage") ? (
          <StoreListingPanel api={api} />
        ) : null}
      <div className="store-dashboard-grid">
        <div className="store-dashboard-main">
          <section className="panel-card store-summary-panel" aria-labelledby="store-summary-title">
            <div className="store-panel-label">3. 摘要数据条</div>
            <div className="panel-heading compact">
              <div>
                <h2 id="store-summary-title">Store 投影摘要</h2>
                <p>摘要来自可重建投影与 Store 目录资料。</p>
              </div>
              <span className="status-badge success"><ShieldCheck /> {result.sourceOfTruth}</span>
            </div>
            <div className="summary-strip store-summary-strip">
              <SummaryItem icon={<Layers3 />} label="秩序" title={`${result.summary.totalZhixus} 条`} />
              <SummaryItem icon={<ShieldCheck />} label="可用" title={`${result.summary.activeZhixus} 条`} tone="success" />
              <SummaryItem icon={<ClipboardCheck />} label="待处理" title={`${result.summary.needsReview} 条`} tone={result.summary.needsReview > 0 ? "warning" : undefined} />
              <SummaryItem icon={<Truck />} label="运行订单" title={summaryMetricsObserved ? `${result.summary.runningOrders} 单` : "未知"} />
              <SummaryItem icon={<Users />} label="已登记执行方" title={summaryMetricsObserved ? `${result.summary.registeredSuppliers} 个` : "未知"} />
            </div>
          </section>

          <section className="panel-card store-catalog-panel" aria-labelledby="store-catalog-title">
            <div className="store-panel-label">4. 检索与目录</div>
            <div className="panel-heading compact">
              <div>
                <h2 id="store-catalog-title">秩序目录</h2>
                <p>检索秩序、订单和供应商；动作仍受 Store 会话权限控制。</p>
              </div>
              {access.canWrite ? (
                <button className="primary-button" data-testid="store-open-docking-button" onClick={onGoDocking} type="button">
                  <GitBranch /> 进入试拼
                </button>
              ) : null}
            </div>

            <form className="store-toolbar store-search-toolbar" onSubmit={(event) => void handleSearchSubmit(event)}>
              <label className="catalog-search store-search-input">
                <Search />
                <input
                  aria-label="搜索 Store"
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索秩序、订单或供应商"
                  value={keyword}
                />
              </label>
              <label className="store-filter-control">
                <SlidersHorizontal />
                <span>类型</span>
                <select
                  aria-label="搜索类型"
                  onChange={(event) => setSearchType(event.target.value as StoreSearchType)}
                  value={searchType}
                >
                  <option value="all">全部</option>
                  <option value="zhixu">秩序</option>
                  <option value="order">订单</option>
                  <option value="supplier">供应商</option>
                </select>
              </label>
              <button className="primary-button" disabled={searchAction.phase === "pending"} type="submit">
                {searchAction.phase === "pending" ? <Loader2 className="spin" /> : <Search />}
                检索
              </button>
              <button
                className="secondary-button"
                disabled={searchAction.phase === "pending"}
                onClick={() => {
                  setKeyword("");
                  setSearchType("all");
                  void onSearch({}).then(() => setSearchAction({ phase: "idle" })).catch((error) => {
                    setSearchAction({ phase: "error", message: readableStoreError(error, "Store 搜索失败") });
                  });
                }}
                type="button"
              >
                重置
              </button>
            </form>

            {!access.canWrite ? (
              <div className="store-access-note">
                <ShieldCheck />
                <span>当前为只读访问，导入、供应商标签、试拼草稿保存等写按钮已隐藏。</span>
              </div>
            ) : null}
            <ActionNotice state={searchAction} />

            {result.search ? (
              <TypedSearchResults result={result} onOpenZhixu={onOpenZhixu} />
            ) : (
              <ZhixuCatalogTable result={result} onOpenZhixu={onOpenZhixu} />
            )}
          </section>
        </div>

        <aside className="panel-card store-import-panel store-import-side" aria-labelledby="store-import-title">
          <div className="store-panel-label">5. 导入秩序草稿</div>
          {access.canWrite ? (
            <>
              <div className="panel-heading compact">
                <div>
                  <h2 id="store-import-title">导入 Zhixu 草稿</h2>
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
                <button className="secondary-button" disabled type="button">
                  <Wand2 /> 导入后审查
                </button>
                <button className="primary-button" data-testid="store-import-draft-button" disabled={importAction.phase === "pending"} onClick={() => void handleImportDraft()} type="button">
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
              text="当前访问不显示导入、试拼保存或治理广播入口。"
            />
          )}
        </aside>
      </div>

      <div className="store-lower-grid">
        {access.canWrite && reviewDraft ? (
          <section className="panel-card store-schema-panel" data-testid="store-schema-review">
            <div className="store-panel-label">6. 能力插件审查</div>
          <div className="panel-heading">
            <div>
              <h2>能力插件审查</h2>
              <p>{reviewDraft.title} · {reviewDraft.status} · {reviewDraft.draftId}</p>
            </div>
            <div className="button-row store-toolbar-actions">
              <button className="secondary-button" disabled={schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleCompileDraft()}>
                {schemaAction.phase === "pending" ? <Loader2 className="spin" /> : <Wand2 />}
                编译预览
              </button>
              <button className="secondary-button" disabled={!productSchema || schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleValidateSchema()}>
                <ClipboardCheck />
                校验
              </button>
              <button className="secondary-button" disabled={!productSchema || schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleSaveSchema()}>
                <Save />
                保存
              </button>
              <button className="primary-button" disabled={!productSchema?.validation.ok || schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleSubmitReview()}>
                <FileCheck2 />
                提交审核
              </button>
            </div>
          </div>

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
              <PublishingChecklist draft={reviewDraft} productSchema={productSchema} />
              <div className="schema-slot-list" data-testid="store-schema-slot-list">
                {productSchema.roleSlots.map((slot) => (
                  <article className="schema-slot-row" key={slot.slotId}>
                    <div>
                      <strong>{slot.performanceSlotLabel ?? slot.label}</strong>
                      <p>{slot.businessPersonaLabels?.join("、") || slot.duty}</p>
                      <small>{slot.capabilityPlugins?.flatMap((plugin) => plugin.stageIds).join(" / ") || "未覆盖阶段"}</small>
                    </div>
                    <div className="schema-plugin-tags">
                      {(slot.capabilityPlugins ?? []).map((plugin, index) => (
                        <span className={`status-badge ${plugin.source === "explicit" ? "success" : "warning"}`} data-plugin-source={plugin.source} key={`${slot.slotId}-${index}`}>
                          {plugin.pluginKind} · {plugin.source}
                        </span>
                      ))}
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
              <div className="button-row schema-review-actions">
                <button className="secondary-button" disabled={schemaAction.phase === "pending" || schemaLocked} onClick={() => void handleConfirmExplicitPlugins()}>
                  <CheckCircle2 />
                  全部确认为 explicit
                </button>
              </div>
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
            onRefreshCatalog={onRefreshCatalog}
          />
        </section>
        ) : (
          <StoreCapabilityPlaceholder access={access} />
        )}

        <StoreSearchInfoPanel result={result} reviewDraft={reviewDraft} />
      </div>
    </section>
  );
}

function DraftGovernancePanel({
  draft,
  onRefreshCatalog
}: {
  readonly draft: StoreZhixuDraftDTO;
  readonly onRefreshCatalog?: (() => Promise<StoreZhixuSearchResultDTO>) | undefined;
}) {
  const active = isDraftOrderCreatable(draft);
  return (
    <section className="governance-publish-card" data-testid="store-governance-publishing">
      <div className="governance-publish-head">
        <div>
          <h3>发布状态</h3>
          <p data-testid="store-governance-heading">Store 审核完成后，由发布工具把 Plan 注册到 UVPStateMachine。</p>
        </div>
        <span className={`status-badge ${active ? "success" : "info"}`} data-testid="store-governance-status">
          {draftStatusLabel(draft.status)}
        </span>
      </div>

      <div className={`governance-state-note ${active ? "success" : "info"}`} data-testid="store-governance-state-note" data-state={draft.status}>
        {active ? <CheckCircle2 /> : <ClipboardCheck />}
        <div>
          <strong>{active ? "Plan 已注册" : "等待发布"}</strong>
          <p data-testid="store-governance-description">
            {active
              ? "索引器已确认 UVPStateMachine 的 PlanRegistered 事件，可以创建订单。"
              : "当前草稿仍处于 Store 工作流中；发布工具负责链上注册。"}
          </p>
        </div>
      </div>

      {active ? (
        <div className="governance-publish-complete" data-testid="store-publishing-complete" data-state="container-ready">
          <div className="governance-publish-complete-head">
            <CheckCircle2 />
            <div>
              <strong>标准信号容器已就绪</strong>
              <p>PlanRegistered 已被索引，该版本可作为标准信号容器创建订单。</p>
            </div>
          </div>
          {onRefreshCatalog ? (
            <div className="button-row">
              <button
                className="primary-button"
                data-testid="store-refresh-catalog-button"
                onClick={() => void onRefreshCatalog()}
              >
                <Layers3 />
                刷新秩序目录
              </button>
            </div>
          ) : null}
          <p className="help-text">Store 目录刷新后，对应的秩序卡片将显示"可创建订单"生命周期，表示标准信号容器 docking 已完成。</p>
        </div>
      ) : null}

    </section>
  );
}

function PublishingChecklist({
  draft,
  productSchema
}: {
  readonly draft: StoreZhixuDraftDTO;
  readonly productSchema: StoreProductSchemaDTO;
}) {
  const items = publishingChecklistItems(draft, productSchema);
  return (
    <section className="store-publishing-checklist" data-testid="store-publishing-checklist">
      <div className="store-publishing-checklist-head">
        <div>
          <h3>发布清单</h3>
          <p>依次检查草稿、编译、资源清单、履约标签、Store 审核与 StateMachine 发布。</p>
        </div>
        <span className={`status-badge ${isDraftOrderCreatable(draft) ? "success" : "info"}`} data-testid="store-publishing-checklist-summary">
          {isDraftOrderCreatable(draft) ? "order-creatable" : "order-blocked"}
        </span>
      </div>
      <div className="store-publishing-checklist-grid">
        {items.map((item) => (
          <article
            className={`store-publishing-checklist-item ${item.tone}`}
            data-state={item.state}
            data-testid={`store-publishing-checklist-${item.id}`}
            key={item.id}
          >
            {checklistIcon(item.state)}
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ZhixuCatalogTable({
  result,
  onOpenZhixu
}: {
  readonly result: StoreZhixuSearchResultDTO;
  readonly onOpenZhixu: (zhixuId: string) => void;
}) {
  return (
    <>
      <div className="store-table" role="table" aria-label="秩序商店列表">
        <div className="store-table-head" role="row">
          <span>秩序</span>
          <span>生命周期</span>
          <span>发布</span>
          <span>运行</span>
          <span>动作</span>
        </div>
        {result.zhixus.map((zhixu) => (
          <article className="store-table-row" key={zhixu.zhixuId} role="row">
            <div>
              <strong>{zhixu.title}</strong>
              <p>{zhixu.subtitle}</p>
              <small>{zhixu.maintainer} · {zhixu.versionLabel}</small>
            </div>
            <StatusBadge tone={statusTone(zhixu.lifecycleStatus)}>{zhixu.lifecycleLabel}</StatusBadge>
            <span>{zhixu.planPublication.label}</span>
            <span data-metric-status={zhixu.metricsStatus}>{storeMetricValue(zhixu, "orderCount", "单")} / {storeMetricValue(zhixu, "openTaskCount", "待办")}</span>
            <button className="secondary-button" data-testid="store-open-zhixu-button" onClick={() => onOpenZhixu(zhixu.zhixuId)}>查看</button>
          </article>
        ))}
      </div>

      {result.zhixus.length === 0 ? (
        <div className="inline-empty">没有匹配的秩序。</div>
      ) : null}
    </>
  );
}

function storeMetricValue(
  zhixu: Pick<StoreZhixuConsoleDTO, "metricsStatus" | "orderCount" | "openTaskCount" | "supplierCount">,
  field: "orderCount" | "openTaskCount" | "supplierCount",
  suffix: string,
): string {
  if (zhixu.metricsStatus !== "observed") {
    return "未知";
  }
  return `${zhixu[field]} ${suffix}`;
}

function TypedSearchResults({
  result,
  onOpenZhixu
}: {
  readonly result: StoreZhixuSearchResultDTO;
  readonly onOpenZhixu: (zhixuId: string) => void;
}) {
  const search = result.search;
  if (!search) {
    return null;
  }
  return (
    <section className="panel-card store-search-results" data-testid="store-typed-search-results">
      <div className="panel-heading">
        <div>
          <h2>搜索结果</h2>
          <p>{search.resultCount} 条结果来自 `/store/search?q=...`，覆盖秩序、订单和供应商。</p>
        </div>
      </div>
      <div className="store-result-list">
        {search.results.map((item) => (
          <article className="store-result-row" key={`${item.resultType}-${item.id}-${item.primaryHref}`}>
            <span className={`status-badge ${resultTypeTone(item.resultType)}`}>{resultTypeLabel(item.resultType)}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.subtitle}</p>
              <small>{item.badgeLabel} · {item.statusLabel}{item.proofHint ? ` · ${item.proofHint}` : ""}</small>
            </div>
            {item.resultType === "zhixu" ? (
              <button className="secondary-button" onClick={() => onOpenZhixu(item.id)}>查看</button>
            ) : (
              <span className="store-result-href">{item.primaryHref}</span>
            )}
          </article>
        ))}
      </div>
      {search.results.length === 0 ? (
        <div className="inline-empty">/store/search 没有返回匹配结果。</div>
      ) : null}
    </section>
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

function ActionNotice({ state, testId }: { readonly state: ActionState; readonly testId?: string }) {
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

function StoreCapabilityPlaceholder({ access }: { readonly access: StoreAccessState }) {
  return (
    <section className="panel-card store-schema-panel store-schema-empty">
      <div className="store-panel-label">6. 能力插件审查</div>
      <div className="panel-heading">
        <div>
          <h2>能力插件审查</h2>
          <p>导入草稿并编译后，这里会显示角色插槽、显式插件、阻断项和发布清单。</p>
        </div>
        <span className="status-badge default">等待草稿</span>
      </div>
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

function StoreSearchInfoPanel({
  result,
  reviewDraft
}: {
  readonly result: StoreZhixuSearchResultDTO;
  readonly reviewDraft?: StoreZhixuDraftDTO | undefined;
}) {
  return (
    <section className="panel-card store-info-panel">
      <div className="store-panel-label">8. 详情与说明</div>
      <div className="panel-heading">
        <div>
          <h2>边界说明</h2>
          <p>Store Console 组织草稿、审查、目录资料和链事件投影。</p>
        </div>
      </div>
      <div className="store-info-list">
        <StoreBoundaryCard
          icon={<ShieldCheck />}
          title="链上事实"
          text={`${result.sourceOfTruth}；订单与 proof 以链事件投影为准。`}
        />
        <StoreBoundaryCard
          icon={<Layers3 />}
          title="当前目录"
          text={`${result.summary.totalZhixus} 条秩序，${result.summary.runningOrders} 单运行订单，${result.summary.registeredSuppliers} 个已登记执行方。`}
        />
        <StoreBoundaryCard
          icon={<ClipboardCheck />}
          title="当前草稿"
          text={reviewDraft ? `${reviewDraft.title} · ${reviewDraft.status}` : "尚未导入本次工作草稿。"}
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

type ChecklistState = "done" | "current" | "blocked" | "pending";

interface PublishingChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly state: ChecklistState;
  readonly tone: "success" | "warning" | "info" | "default";
}

function publishingChecklistItems(
  draft: StoreZhixuDraftDTO,
  productSchema: StoreProductSchemaDTO
): readonly PublishingChecklistItem[] {
  const resourceReady = isResourceManifestReviewed(productSchema);
  const supplierPassportReady = isSupplierCapabilityPassportReviewed(productSchema);
  const reviewApproved = isStoreReviewApprovedStatus(draft.status);
  return [
    {
      id: "draft",
      label: "draft saved",
      detail: `${draft.draftId} 已导入 Store 草稿；不会自动发布。`,
      state: "done",
      tone: "success"
    },
    {
      id: "compile",
      label: "compile valid",
      detail: draft.compilePreview
        ? `${shortHash(draft.compilePreview.planId, { prefixLength: 8, suffixLength: 8 })} / ${shortHash(draft.compilePreview.planHash, { prefixLength: 8, suffixLength: 8 })}`
        : "等待编译预览生成 deterministic plan identity。",
      state: draft.compilePreview ? "done" : draft.status === "compile_failed" ? "blocked" : "pending",
      tone: draft.compilePreview ? "success" : draft.status === "compile_failed" ? "warning" : "default"
    },
    {
      id: "resource",
      label: "Product Schema / resource manifest",
      detail: resourceReady
        ? `${productSchema.stages.length} stages, ${productSchema.orderPermissionTable.length} permissions, ${resourceEvidenceCount(productSchema)} evidence refs reviewed.`
        : "阶段、权限或凭证资源清单仍需补齐；不得把合同/发票/物流明文放上链。",
      state: resourceReady ? "done" : "blocked",
      tone: resourceReady ? "success" : "warning"
    },
    {
      id: "supplier-passport",
      label: "supplier capability passport",
      detail: supplierPassportReady
        ? "每个必需履约插槽都有 explicit capability plugin 和业务身份标签。"
        : "必需供应商/执行方插槽还缺 explicit 插件或业务身份标签。",
      state: supplierPassportReady ? "done" : "blocked",
      tone: supplierPassportReady ? "success" : "warning"
    },
    {
      id: "store-review",
      label: "Store review approved",
      detail: reviewApproved
        ? "Store 审核已批准该版本进入发布流程。"
        : "等待 Store operator 提交审核。",
      state: reviewApproved ? "done" : "current",
      tone: reviewApproved ? "success" : "info"
    },
    {
      id: "order-creatable",
      label: "StateMachine publication",
      detail: isDraftOrderCreatable(draft)
        ? "PlanRegistered 已被索引，可以创建订单。"
        : "等待发布工具注册 Plan 并由索引器确认。",
      state: isDraftOrderCreatable(draft) ? "done" : "blocked",
      tone: isDraftOrderCreatable(draft) ? "success" : "warning"
    }
  ];
}

function checklistIcon(state: ChecklistState): ReactNode {
  switch (state) {
    case "done":
      return <CheckCircle2 />;
    case "current":
      return <RefreshCw />;
    case "blocked":
      return <AlertTriangle />;
    case "pending":
      return <ClipboardCheck />;
  }
}

function isResourceManifestReviewed(productSchema: StoreProductSchemaDTO): boolean {
  return productSchema.validation.ok &&
    productSchema.stages.length > 0 &&
    productSchema.orderPermissionTable.length > 0 &&
    productSchema.orderPermissionTable.every((entry) => entry.requiredEvidence.length > 0);
}

function resourceEvidenceCount(productSchema: StoreProductSchemaDTO): number {
  return productSchema.orderPermissionTable.reduce((count, entry) => count + entry.requiredEvidence.length, 0);
}

function isSupplierCapabilityPassportReviewed(productSchema: StoreProductSchemaDTO): boolean {
  const requiredSlots = productSchema.roleSlots.filter((slot) => slot.required);
  return productSchema.validation.ok &&
    requiredSlots.length > 0 &&
    requiredSlots.every((slot) =>
      (slot.businessPersonaLabels?.length ?? 0) > 0 &&
      (slot.capabilityPlugins ?? []).length > 0 &&
      (slot.capabilityPlugins ?? []).every((plugin) => plugin.source === "explicit")
    );
}

function isStoreReviewApprovedStatus(status: StoreZhixuDraftStatus): boolean {
  return status === "approved_for_broadcast" || status === "active";
}

function isDraftOrderCreatable(draft: StoreZhixuDraftDTO): boolean {
  return draft.status === "active";
}

function isSchemaLockedStatus(status: StoreZhixuDraftStatus): boolean {
  return status === "approved_for_broadcast" ||
    status === "active" ||
    status === "rejected" ||
    status === "revoked";
}

function draftStatusLabel(status: StoreZhixuDraftStatus): string {
  return status;
}

function resultTypeLabel(type: string): string {
  switch (type) {
    case "zhixu":
      return "秩序";
    case "order":
      return "订单";
    case "supplier":
      return "供应商";
    default:
      return "结果";
  }
}

function resultTypeTone(type: string): "success" | "warning" | "info" | "default" {
  switch (type) {
    case "zhixu":
      return "success";
    case "order":
      return "info";
    case "supplier":
      return "warning";
    default:
      return "default";
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

function confirmSchemaPluginsExplicit(schema: StoreProductSchemaDTO): StoreProductSchemaDTO {
  const roleSlots = schema.roleSlots.map((slot) => ({
    ...slot,
    capabilityPlugins: (slot.capabilityPlugins ?? []).map((plugin) => ({
      ...plugin,
      source: "explicit" as const
    }))
  }));
  return {
    ...schema,
    roleSlots,
    capabilityPlugins: roleSlots.flatMap((slot) => slot.capabilityPlugins ?? [])
  };
}
