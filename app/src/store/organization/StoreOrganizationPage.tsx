import { Link2, Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { readableStoreError, type StoreApiClient } from "../api";
import { StoreJoinPage } from "../StoreJoinPage";
import { StoreSupplierPage } from "../suppliers/StoreSupplierPage";
import type { StoreAccessState, StoreSupplierDTO } from "../types";

type RosterState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly suppliers: readonly StoreSupplierDTO[] }
  | { readonly status: "error"; readonly message: string };

/**
 * 组织块：在册主体（供应商资料/能力标签）+ 加入申请审核 + 邀请链接入口。
 * 组织只管"谁在这条秩序里、以什么角色在册"，不指派订单执行者。
 */
export function StoreOrganizationPage({
  access,
  api,
  onOpenLinks
}: {
  readonly access: StoreAccessState;
  readonly api: StoreApiClient;
  readonly onOpenLinks: () => void;
}) {
  const [roster, setRoster] = useState<RosterState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setRoster({ status: "loading" });
    void api.listSuppliers().then((result) => {
      if (!cancelled) {
        setRoster({ status: "ready", suppliers: result.data });
      }
    }).catch((error) => {
      if (!cancelled) {
        setRoster({ status: "error", message: readableStoreError(error, "在册名单加载失败") });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <section className="page-shell store-console-page" data-testid="store-organization-page">
      <div className="page-title-row">
        <div>
          <h2><Users /> 组织</h2>
          <p>邀请实体加入秩序、审核加入申请、维护在册名单与能力标签。订单由当事人自己开，组织不指派订单执行者。</p>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={onOpenLinks} type="button">
            <Link2 /> 生成邀请 / 分享链接
          </button>
        </div>
      </div>

      <div className="summary-strip store-summary-strip">
        <div className="summary-item">
          <Users />
          <div>
            <span>在册主体</span>
            <strong>
              {roster.status === "ready"
                ? `${roster.suppliers.length} 个`
                : roster.status === "loading"
                  ? "读取中"
                  : "未知"}
            </strong>
          </div>
        </div>
        <div className="summary-item">
          <UserPlus />
          <div>
            <span>加入审核</span>
            <strong>{access.anchoredAddress ? "已锚定会话可审核" : "需先登录"}</strong>
          </div>
        </div>
        <div className="summary-item">
          <ShieldCheck />
          <div>
            <span>授权边界</span>
            <strong>审核只做在册与授权，不做订单指派</strong>
          </div>
        </div>
      </div>

      {roster.status === "error" ? (
        <div className="state-panel error" role="alert">
          <span><ShieldCheck /></span>
          <div>
            <h2>在册名单加载失败</h2>
            <p>{roster.message}</p>
          </div>
        </div>
      ) : null}

      {roster.status === "loading" ? (
        <p className="muted"><Loader2 className="spin" /> 正在读取在册名单…</p>
      ) : null}

      <section className="panel-card" aria-labelledby="store-join-review-title">
        <div className="panel-heading compact">
          <div>
            <span className="store-section-kicker">邀请</span>
            <h2 id="store-join-review-title">加入申请审核</h2>
            <p>申请人通过邀请链接提交加入申请；publisher 或受托成员审核通过后执行身份配对与链上授权证据记录。</p>
          </div>
        </div>
        <StoreJoinPage access={access} api={api} />
      </section>

      <section className="panel-card" aria-labelledby="store-roster-title">
        <div className="panel-heading compact">
          <div>
            <span className="store-section-kicker">在册</span>
            <h2 id="store-roster-title">在册主体与能力</h2>
            <p>查看主体与钱包的链上身份映射，维护 Store 侧能力标签；这些资料不构成对任何主体的背书。</p>
          </div>
        </div>
        <StoreSupplierPage access={access} api={api} />
      </section>
    </section>
  );
}
