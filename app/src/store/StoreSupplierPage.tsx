import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Tag,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import type { StoreAccessState, StoreSupplierDTO } from "./types";

type SupplierState =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly suppliers: readonly StoreSupplierDTO[];
    }
  | { readonly status: "error"; readonly message: string };

type SupplierActionState =
  | { readonly phase: "idle" }
  | { readonly phase: "pending"; readonly message: string }
  | { readonly phase: "success"; readonly message: string }
  | { readonly phase: "error"; readonly message: string };

interface SupplierEditForm {
  readonly capabilityTags: readonly string[];
  readonly roleSlotIdsText: string;
  readonly stageIdsText: string;
}

export function StoreSupplierPage({
  access,
  api,
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
}) {
  const [state, setState] = useState<SupplierState>({ status: "loading" });
  const [action, setAction] = useState<SupplierActionState>({ phase: "idle" });
  const [editingSupplierId, setEditingSupplierId] = useState<
    string | undefined
  >();
  const [editForm, setEditForm] = useState<SupplierEditForm | undefined>();
  const canUpdateSupplierTags = hasStoreCapability(
    access,
    "store.supplier.tags.update",
  );
  const canReviewSupplier = hasStoreCapability(access, "store.supplier.review");
  const canEditSupplierCapabilities =
    canUpdateSupplierTags && canReviewSupplier;

  const loadSuppliers = useCallback(
    async (showLoading = true, isCancelled: () => boolean = () => false) => {
      if (showLoading && !isCancelled()) {
        setState({ status: "loading" });
      }
      try {
        const result = await api.listSuppliers();
        if (!isCancelled()) {
          setState({ status: "ready", suppliers: result.data });
        }
      } catch (error) {
        if (!isCancelled()) {
          setState({
            status: "error",
            message: readableStoreError(error, "供应商列表加载失败"),
          });
        }
      }
    },
    [api],
  );

  useEffect(() => {
    let cancelled = false;
    void loadSuppliers(true, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadSuppliers]);

  const openEdit = (supplier: StoreSupplierDTO) => {
    setEditingSupplierId(supplier.supplierId);
    setEditForm({
      capabilityTags: supplier.capabilityTags,
      roleSlotIdsText: supplier.supportedRoleSlotIds.join("\n"),
      stageIdsText: supplier.supportedStageIds.join("\n"),
    });
    setAction({ phase: "idle" });
  };

  const cancelEdit = () => {
    setEditingSupplierId(undefined);
    setEditForm(undefined);
    setAction({ phase: "idle" });
  };

  const saveEdit = async (supplier: StoreSupplierDTO) => {
    if (!editForm) {
      return;
    }
    setAction({
      phase: "pending",
      message: "正在写入 Store 供应商能力 metadata",
    });
    try {
      const result = await api.updateSupplierCapabilities(supplier.supplierId, {
        capabilityTags: editForm.capabilityTags,
        supportedRoleSlotIds: normalizeTextList(editForm.roleSlotIdsText),
        supportedStageIds: normalizeTextList(editForm.stageIdsText),
        reviewStatus: supplier.reviewStatus,
      });
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              suppliers: current.suppliers.map((item) =>
                item.supplierId === result.data.supplier.supplierId
                  ? result.data.supplier
                  : item,
              ),
            }
          : current,
      );
      setEditingSupplierId(undefined);
      setEditForm(undefined);
      setAction({
        phase: "success",
        message: "Store 供应商资料已保存。",
      });
      void loadSuppliers(false);
    } catch (error) {
      setAction({
        phase: "error",
        message: readableStoreError(error, "供应商能力 metadata 保存失败"),
      });
    }
  };

  return (
    <section className="page-shell" data-testid="store-supplier-page">
      <div className="page-title-row">
        <div>
          <h2>供应商目录</h2>
          <p>
            查看主体与钱包的链上身份映射，并维护 Store 内部资料和匹配标签。
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void loadSuppliers()}
          type="button"
        >
          <RefreshCw /> 刷新
        </button>
      </div>

      {!canEditSupplierCapabilities ? (
        <div className="store-access-note">
          <ShieldCheck />
          <span>
            {supplierCapabilityBlockedCopy(
              access,
              canUpdateSupplierTags,
              canReviewSupplier,
            )}
          </span>
        </div>
      ) : (
        <div className="store-access-note">
          <ShieldCheck />
          <span>
            当前会话可以维护 Store 的供应商能力 metadata；这些资料只用于本 Store 的检索和匹配。
          </span>
        </div>
      )}

      <ActionNotice state={action} />

      {state.status === "loading" ? (
        <StatePanel
          icon={<Loader2 className="spin" />}
          title="正在加载供应商"
          desc="读取 Identity Registry 映射和 Store 供应商资料。"
        />
      ) : null}

      {state.status === "error" ? (
        <StatePanel
          icon={<AlertTriangle />}
          title="供应商接口未就绪"
          desc={state.message}
          tone="error"
        />
      ) : null}

      {state.status === "ready" ? (
        <div className="store-supplier-layout">
          <div className="store-card-grid">
            {state.suppliers.map((supplier) => (
              <article
                className={`store-supplier-card ${editingSupplierId === supplier.supplierId ? "is-selected" : ""}`}
                key={supplier.supplierId}
              >
                <div className="store-card-title">
                  <Users />
                  <div>
                    <strong>{supplier.displayName}</strong>
                    <span>{supplier.wallet ?? supplier.supplierSubjectId}</span>
                  </div>
                  <span
                    className={`status-badge ${supplier.identityStatus === "active" ? "success" : "warning"}`}
                  >
                    {supplier.identityLabel}
                  </span>
                </div>

                <div className="store-supplier-meta-row">
                  <span>
                    审核：{supplierReviewLabel(supplier.reviewStatus)}
                  </span>
                  <span>订单：{supplier.recentOrderCount}</span>
                  <span>待办：{supplier.openTaskCount}</span>
                </div>

                <SupplierTagRow
                  icon={<Tag />}
                  label="能力"
                  values={supplier.capabilityTags}
                  empty="未配置能力标签"
                />
                <SupplierTagRow
                  label="角色槽"
                  values={supplier.supportedRoleSlotIds}
                  empty="未绑定角色槽"
                />
                <SupplierTagRow
                  label="阶段"
                  values={supplier.supportedStageIds}
                  empty="未绑定阶段"
                />
                <p>{supplier.nextAction}</p>
                {supplier.updatedAt ? (
                  <small>更新：{supplier.updatedAt}</small>
                ) : null}

                {canEditSupplierCapabilities ? (
                  <button
                    className="secondary-button compact"
                    data-testid="store-edit-supplier-tags-button"
                    onClick={() => openEdit(supplier)}
                    type="button"
                  >
                    <Pencil /> 编辑能力 metadata
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          <aside
            className="store-supplier-drawer"
            aria-label="供应商 metadata 编辑"
          >
            {(() => {
              const editingSupplier = state.suppliers.find(
                (supplier) => supplier.supplierId === editingSupplierId,
              );
              if (editingSupplier && editForm) {
                return (
                  <section className="panel-card store-supplier-editor-card">
                    <div className="panel-heading compact">
                      <div>
                        <h2>编辑供应商元数据</h2>
                        <p>
                          {editingSupplier.displayName} · 仅写入 Store
                          metadata。
                        </p>
                      </div>
                    </div>
                    <div className="store-access-note compact">
                      <ShieldCheck />
                      <span>
                        能力标签用于 Store 内部检索和匹配；链上只登记主体与钱包映射。
                      </span>
                    </div>
                    <SupplierEditPanel
                      form={editForm}
                      setForm={setEditForm}
                      saving={action.phase === "pending"}
                      onCancel={cancelEdit}
                      onSave={() => void saveEdit(editingSupplier)}
                    />
                  </section>
                );
              }
              return (
                <section className="panel-card store-supplier-editor-card">
                  <div className="panel-heading compact">
                    <div>
                      <h2>编辑抽屉</h2>
                      <p>
                        选择一张供应商卡片后，在这里维护 Store 侧能力 metadata。
                      </p>
                    </div>
                  </div>
                  <div className="store-access-note compact">
                    <ShieldCheck />
                    <span>
                      {canEditSupplierCapabilities
                        ? "metadata 编辑只改变本 Store 的供应商资料。"
                        : "当前会话不能打开 metadata 编辑抽屉；写入仍会被权限边界阻断。"}
                    </span>
                  </div>
                </section>
              );
            })()}
          </aside>
        </div>
      ) : null}

      {state.status === "ready" && state.suppliers.length === 0 ? (
        <div className="inline-empty">
          <CheckCircle2 /> 当前 Store 还没有供应商资料。
        </div>
      ) : null}
    </section>
  );
}

function SupplierEditPanel({
  form,
  setForm,
  saving,
  onCancel,
  onSave,
}: {
  readonly form: SupplierEditForm;
  readonly setForm: (value: SupplierEditForm) => void;
  readonly saving: boolean;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}) {
  return (
    <div
      className="store-supplier-edit-panel"
      data-testid="store-supplier-edit-panel"
    >
      <div className="form-grid store-supplier-edit-form">
        <label className="field">
          <span>capabilityTags</span>
          <textarea
            onChange={(event) =>
              setForm({
                ...form,
                capabilityTags: normalizeTextList(event.target.value),
              })
            }
            placeholder="每行一个 Store 内部标签"
            value={form.capabilityTags.join("\n")}
          />
        </label>
        <label className="field">
          <span>supportedRoleSlotIds</span>
          <textarea
            onChange={(event) =>
              setForm({ ...form, roleSlotIdsText: event.target.value })
            }
            placeholder="每行一个 roleSlotId"
            value={form.roleSlotIdsText}
          />
        </label>
        <label className="field">
          <span>supportedStageIds</span>
          <textarea
            onChange={(event) =>
              setForm({ ...form, stageIdsText: event.target.value })
            }
            placeholder="每行一个 stageId"
            value={form.stageIdsText}
          />
        </label>
      </div>

      <div className="store-inline-actions">
        <button
          className="primary-button"
          disabled={saving}
          onClick={onSave}
          type="button"
        >
          {saving ? <Loader2 className="spin" /> : <Save />} 保存
        </button>
        <button
          className="secondary-button"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          <X /> 取消
        </button>
      </div>
    </div>
  );
}

function SupplierTagRow({
  icon,
  label,
  values,
  empty,
}: {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly values: readonly string[];
  readonly empty: string;
}) {
  return (
    <div className="store-tag-row compact">
      <span>
        {icon}
        {label}
      </span>
      <div>
        {values.length > 0 ? (
          values.map((value) => <small key={value}>{value}</small>)
        ) : (
          <em>{empty}</em>
        )}
      </div>
    </div>
  );
}

function ActionNotice({ state }: { readonly state: SupplierActionState }) {
  if (state.phase === "idle") {
    return null;
  }
  const icon =
    state.phase === "pending" ? (
      <Loader2 className="spin" />
    ) : state.phase === "success" ? (
      <CheckCircle2 />
    ) : (
      <AlertTriangle />
    );
  return (
    <div
      className={`action-notice ${state.phase}`}
      data-testid="store-supplier-action-notice"
      data-phase={state.phase}
    >
      {icon}
      <span>{state.message}</span>
    </div>
  );
}

function StatePanel({
  icon,
  title,
  desc,
  tone = "muted",
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

function supplierCapabilityBlockedCopy(
  access: StoreAccessState,
  canUpdateSupplierTags: boolean,
  canReviewSupplier: boolean,
): string {
  if (!access.canWrite) {
    return "当前只读访问，不显示供应商标签编辑按钮。";
  }
  if (!canUpdateSupplierTags) {
    return "当前会话缺少 store.supplier.tags.update；供应商能力编辑已关闭，后端写入会返回 403。";
  }
  if (!canReviewSupplier) {
    return "当前会话缺少 store.supplier.review；供应商能力编辑已关闭，后端写入会返回 403。";
  }
  return "当前会话不能编辑供应商能力 metadata。";
}

function supplierReviewLabel(status: StoreSupplierDTO["reviewStatus"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "submitted":
      return "待审";
    case "approved_for_broadcast":
      return "已批准";
    case "rejected":
      return "已拒绝";
    case "revoked":
      return "已撤销";
  }
}

function hasStoreCapability(
  access: StoreAccessState,
  capability: string,
): boolean {
  return access.capabilities.includes(
    capability as StoreAccessState["capabilities"][number],
  );
}

function normalizeTextList(value: string): readonly string[] {
  return uniqueSorted(
    value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
