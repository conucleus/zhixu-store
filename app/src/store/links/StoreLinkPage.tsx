import { AlertTriangle, Check, Copy, Link2, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { StoreZhixuSearchResultDTO } from "../types";

type LinkKind = "invite" | "share";

/**
 * 链接入口：运营台不提供目录/搜索/公开上架；参与方与读者一律通过链接进入。
 * 生成的是本站可消费的链接（邀请加入页 / 装修分享页），不依赖未定义的跨端参数。
 */
export function StoreLinkPage({
  catalog,
  catalogError
}: {
  readonly catalog?: StoreZhixuSearchResultDTO | undefined;
  readonly catalogError?: string | undefined;
}) {
  const [feedback, setFeedback] = useState<{ readonly key: string; readonly message: string; readonly phase: "success" | "error" } | undefined>();

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function copyLink(key: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({ key, message: "链接已复制", phase: "success" });
    } catch {
      setFeedback({ key, message: "复制失败：浏览器未授予剪贴板权限", phase: "error" });
    }
  }

  return (
    <section className="page-shell store-console-page" data-testid="store-link-page">
      <div className="page-title-row">
        <div>
          <h2><Link2 /> 链接</h2>
          <p>入口只有链接：邀请链接用于参与方确认加入，分享链接用于读者查看装修页。没有目录、搜索或公开上架。</p>
        </div>
        <span className="status-badge info"><ShieldCheck /> 本站链接</span>
      </div>

      <div className="store-access-note">
        <ShieldCheck />
        <span>
          链接里不含一次性凭据；邀请页要求打开者自行完成钱包登录后提交加入申请。
          参与方侧的完整动作（开单/任务/证据/签名）在订单 app 完成，本站不承担履约面。
        </span>
      </div>

      {catalogError ? (
        <div className="state-panel error" role="alert">
          <span><AlertTriangle /></span>
          <div>
            <h2>链接列表不可用</h2>
            <p>{catalogError}</p>
          </div>
        </div>
      ) : null}

      {!catalogError && !catalog ? (
        <p className="muted"><Loader2 className="spin" /> 正在读取可分享的秩序…</p>
      ) : null}

      {catalog && catalog.zhixus.length === 0 ? (
        <div className="inline-empty">Store 里还没有可分享的秩序。先在「设计」发布一份。</div>
      ) : null}

      {catalog && catalog.zhixus.length > 0 ? (
        <div className="store-card-grid">
          {catalog.zhixus.map((zhixu) => {
            const inviteLink = `${origin}/store?join=${encodeURIComponent(zhixu.zhixuId)}`;
            const shareLink = `${origin}/store?share=${encodeURIComponent(zhixu.zhixuId)}`;
            return (
              <article className="slide-card store-card" key={zhixu.zhixuId}>
                <div className="store-card-title">
                  <strong>{zhixu.title}</strong>
                  <span>{zhixu.lifecycleLabel}</span>
                </div>
                <p className="muted">{zhixu.subtitle} · {zhixu.maintainer}</p>
                <LinkRow
                  kind="invite"
                  label="邀请链接（加入秩序）"
                  value={inviteLink}
                  copied={feedback?.key === `invite:${zhixu.zhixuId}` ? feedback : undefined}
                  onCopy={() => void copyLink(`invite:${zhixu.zhixuId}`, inviteLink)}
                />
                <LinkRow
                  kind="share"
                  label="分享链接（看装修页）"
                  value={shareLink}
                  copied={feedback?.key === `share:${zhixu.zhixuId}` ? feedback : undefined}
                  onCopy={() => void copyLink(`share:${zhixu.zhixuId}`, shareLink)}
                />
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function LinkRow({
  kind,
  label,
  value,
  copied,
  onCopy
}: {
  readonly kind: LinkKind;
  readonly label: string;
  readonly value: string;
  readonly copied?: { readonly message: string; readonly phase: "success" | "error" } | undefined;
  readonly onCopy: () => void;
}) {
  return (
    <div className="store-inline-actions" data-testid={`store-link-row-${kind}`}>
      <label className="field">
        <span>{label}</span>
        <input readOnly value={value} data-testid={`store-link-input-${kind}`} onFocus={(event) => event.target.select()} />
      </label>
      <button className="secondary-button" onClick={onCopy} type="button" data-testid={`store-link-copy-${kind}`}>
        {copied?.phase === "success" ? <Check /> : <Copy />} 复制
      </button>
      {copied ? <small className={copied.phase === "error" ? "store-account-message is-error" : "muted"}>{copied.message}</small> : null}
    </div>
  );
}
