import { AlertTriangle, CheckCircle2, ClipboardCheck, Copy, MessageSquareWarning, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { readableStoreError } from "../api";
import type { StoreAccessState, StoreZhixuSearchResultDTO } from "../types";

type SignalCategory = "confirm" | "accept" | "objection" | "opinion";

const SIGNAL_CATEGORY_OPTIONS: readonly { readonly value: SignalCategory; readonly label: string; readonly hint: string }[] = [
  { value: "confirm", label: "确认", hint: "普通动作：确认某条既成事实" },
  { value: "accept", label: "验收", hint: "普通动作：验收某个阶段成果" },
  { value: "objection", label: "异议", hint: "普通动作：对事实或验收提出异议" },
  { value: "opinion", label: "一般意见", hint: "规则未覆盖的异常/争议，陈述意见即可" }
];

/**
 * 维护块：规则外争议/异常出现时，由运营方发一条普通意见信号。
 * 不设争议中心、不仲裁、不判责；信号就是普通动作，不是管理员处置。
 *
 * 当前 Store API / StoreApiClient 没有意见信号写路径，本页只提供入口与
 * 可复制的信号草稿，不伪造提交成功（fail-closed）。写路径接入后在这里接线。
 */
export function StoreMaintenancePage({
  access,
  catalog,
  catalogError
}: {
  readonly access: StoreAccessState;
  readonly catalog?: StoreZhixuSearchResultDTO | undefined;
  readonly catalogError?: string | undefined;
}) {
  const [zhixuId, setZhixuId] = useState("");
  const [category, setCategory] = useState<SignalCategory>("opinion");
  const [statement, setStatement] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | undefined>();
  const [copyError, setCopyError] = useState<string | undefined>();

  const selected = catalog?.zhixus.find((zhixu) => zhixu.zhixuId === zhixuId);
  const categoryOption = SIGNAL_CATEGORY_OPTIONS.find((option) => option.value === category);
  const draftReady = statement.trim().length > 0;
  const draftText = draftReady
    ? [
      "【普通意见信号草稿】",
      `秩序：${selected ? `${selected.title}（${selected.zhixuId}）` : "未指定"}`,
      `类别：${categoryOption?.label ?? category}`,
      `意见：${statement.trim()}`,
      "说明：这是普通信号，不是仲裁或处置结论。"
    ].join("\n")
    : "";

  async function handleCopyDraft(): Promise<void> {
    if (!draftReady) {
      setCopyError("请先填写意见内容");
      return;
    }
    setCopyError(undefined);
    try {
      await navigator.clipboard.writeText(draftText);
      setCopyFeedback("信号草稿已复制，可通过既有沟通渠道转交");
    } catch (error) {
      setCopyFeedback(undefined);
      setCopyError(readableStoreError(error, "复制失败：浏览器未授予剪贴板权限"));
    }
  }

  return (
    <section className="page-shell store-console-page" data-testid="store-maintenance-page">
      <div className="page-title-row">
        <div>
          <h2><MessageSquareWarning /> 维护</h2>
          <p>规则没覆盖的争议/异常出现时，发一条普通意见信号；不仲裁、不判责，系统性缺口发新版本。</p>
        </div>
        <span className={`store-access-pill ${access.canWrite ? "can-write" : ""}`}>
          <ShieldCheck /> {access.label}
        </span>
      </div>

      <div className="warning-box" role="alert" data-testid="store-maintenance-api-gap">
        <AlertTriangle />
        <div>
          <strong>意见信号写路径尚未接入（缺口，fail-closed）</strong>
          <p>
            Store API 客户端与 /store/* 路由目前都没有意见信号提交接口，本页不发送请求、不显示假成功。
            接入写路径前，这里只支持整理并复制一份信号草稿。
          </p>
        </div>
      </div>

      <div className="store-dashboard-grid">
        <section className="panel-card store-dashboard-main">
          <div className="panel-heading compact">
            <div>
              <span className="store-section-kicker">普通信号</span>
              <h2>起草意见信号</h2>
              <p>信号内容会被如实记录，用于后续版本修订或当事人处理；它不改变任何订单状态。</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>秩序（可选）</span>
              <select value={zhixuId} onChange={(event) => setZhixuId(event.target.value)} data-testid="store-maintenance-zhixu-select">
                <option value="">不指定具体秩序</option>
                {(catalog?.zhixus ?? []).map((zhixu) => (
                  <option key={zhixu.zhixuId} value={zhixu.zhixuId}>{zhixu.title}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>信号类别</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as SignalCategory)}
                data-testid="store-maintenance-category-select"
              >
                {SIGNAL_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>意见内容<em>*</em></span>
              <textarea
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
                rows={6}
                placeholder="陈述发生了什么、影响哪个阶段/角色；不要写处置结论或责任判定。"
                data-testid="store-maintenance-statement"
              />
            </label>
          </div>

          {catalogError ? <p className="store-account-message is-error">秩序清单不可用：{catalogError}</p> : null}

          <div className="store-inline-actions">
            <button
              className="secondary-button"
              disabled={!access.canWrite || !draftReady}
              onClick={() => void handleCopyDraft()}
              type="button"
              data-testid="store-maintenance-copy-draft"
            >
              <Copy /> 复制信号草稿
            </button>
            <button className="primary-button" disabled type="button" data-testid="store-maintenance-submit" title="写路径未接入">
              <ClipboardCheck /> 提交意见信号（写路径未接入）
            </button>
          </div>

          {copyFeedback ? <p className="store-account-message" data-testid="store-maintenance-feedback"><CheckCircle2 /> {copyFeedback}</p> : null}
          {copyError ? <p className="store-account-message is-error">{copyError}</p> : null}
        </section>

        <aside className="panel-card store-import-side">
          <div className="panel-heading compact">
            <div>
              <h3>维护边界</h3>
              <p>维护动作只做两件事：发普通信号、发新版本修规则。</p>
            </div>
          </div>
          <div className="store-check-list">
            <span><ShieldCheck /> 不做争议中心、不仲裁、不判责</span>
            <span><ShieldCheck /> 不冻结资金、不改订单状态</span>
            <span><ShieldCheck /> 规则系统性缺口 → 发新版本</span>
            <span><ShieldCheck /> 信号是普通动作，与确认/验收同一性质</span>
          </div>
          {!access.canWrite ? (
            <p className="store-account-warn">当前为只读会话：可以查看入口，但不能起草或复制信号。</p>
          ) : null}
          {access.canWrite && !access.anchoredAddress ? (
            <p className="store-account-warn">当前会话未锚定钱包地址；接入写路径后，提交将要求锚定会话（与其它 Store 写同口径）。</p>
          ) : null}
          {copyFeedback === undefined && draftText ? (
            <details className="store-advanced">
              <summary>预览信号草稿</summary>
              <pre className="mono">{draftText}</pre>
            </details>
          ) : null}
          {catalog && catalog.zhixus.length === 0 ? <p className="muted">Store 当前没有可见秩序，仍可发不指定秩序的意见。</p> : null}
        </aside>
      </div>
    </section>
  );
}
