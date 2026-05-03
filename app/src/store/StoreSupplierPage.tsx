import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Tag, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import type { StoreAccessState, StoreSupplierDTO } from "./types";

type SupplierState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly suppliers: readonly StoreSupplierDTO[] }
  | { readonly status: "error"; readonly message: string };

export function StoreSupplierPage({
  access,
  api
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
}) {
  const [state, setState] = useState<SupplierState>({ status: "loading" });
  const [notice, setNotice] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void api.listSuppliers().then((result) => {
      if (!cancelled) {
        setState({ status: "ready", suppliers: result.data });
      }
    }).catch((error) => {
      if (!cancelled) {
        setState({ status: "error", message: readableStoreError(error, "供应商列表加载失败") });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <section className="page-shell" data-testid="store-supplier-page">
      <div className="page-title-row">
        <div>
          <h2>供应商背书</h2>
          <p>查看官方域下的供应商背书和能力标签；标签写入接口由后续 Store 后端接入。</p>
        </div>
        {access.canWrite ? (
          <button className="secondary-button" data-testid="store-edit-supplier-tags-button" onClick={() => setNotice("能力标签写接口尚未接入，未写入任何 Store 或链上状态。")}>
            <Tag /> 编辑能力标签
          </button>
        ) : null}
      </div>

      {!access.canWrite ? (
        <div className="store-access-note">
          <ShieldCheck />
          <span>当前只读访问，不显示供应商标签编辑按钮。</span>
        </div>
      ) : null}

      {notice ? (
        <div className="action-notice error">
          <AlertTriangle />
          <span>{notice}</span>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <StatePanel icon={<Loader2 className="spin" />} title="正在加载供应商" desc="读取 Trust Registry 供应商投影。" />
      ) : null}

      {state.status === "error" ? (
        <StatePanel icon={<AlertTriangle />} title="供应商接口未就绪" desc={state.message} tone="error" />
      ) : null}

      {state.status === "ready" ? (
        <div className="store-card-grid">
          {state.suppliers.map((supplier) => (
            <article className="store-supplier-card" key={supplier.supplierId}>
              <div className="store-card-title">
                <Users />
                <div>
                  <strong>{supplier.displayName}</strong>
                  <span>{supplier.wallet ?? supplier.supplierId}</span>
                </div>
                <span className={`status-badge ${supplier.status === "attested" ? "success" : "warning"}`}>
                  {supplier.status === "attested" ? "已背书" : supplier.status === "revoked" ? "已撤销" : "未发现"}
                </span>
              </div>
              <p>{supplier.capabilityLabel}</p>
              {supplier.updatedAt ? <small>更新：{supplier.updatedAt}</small> : null}
            </article>
          ))}
        </div>
      ) : null}

      {state.status === "ready" && state.suppliers.length === 0 ? (
        <div className="inline-empty"><CheckCircle2 /> 当前官方域没有供应商背书投影。</div>
      ) : null}
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
