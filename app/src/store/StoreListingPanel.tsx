import { ListChecks, Loader2, PackagePlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { readableStoreError, type StoreApiClient } from "./api";
import { listingStatusLabel } from "./StoreAnchorPanel";
import type { StoreListingView } from "./types";
import { shortValue } from "../shared/frontend";

type ListingsState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly listings: readonly StoreListingView[] }
  | { readonly status: "error"; readonly message: string };

/**
 * PRD92 上架治理面板（运营方）：导入链上秩序锚 → 锚核验 → 审核公开 → 下架/重新上架。
 * 只改 Store 可见性，不改链上事实；审核通过要求锚核验一致。
 */
export function StoreListingPanel({ api }: { readonly api: StoreApiClient }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ListingsState>({ status: "loading" });
  const [planId, setPlanId] = useState("");
  const [planHash, setPlanHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await api.listListings();
      setState({ status: "ready", listings: result.data.listings });
    } catch (loadError) {
      setState({ status: "error", message: readableStoreError(loadError, "上架列表加载失败") });
    }
  }, [api]);

  useEffect(() => {
    if (open && state.status === "loading") {
      void reload();
    }
  }, [open, state.status, reload]);

  async function run(action: () => Promise<unknown>, done: string, onSucceeded?: () => void): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await action();
      setMessage(done);
      onSucceeded?.();
      await reload();
    } catch (runError) {
      setError(readableStoreError(runError, "操作失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="store-listing-panel" data-testid="store-listing-panel">
      <button className="proof-toggle" onClick={() => setOpen((value) => !value)} data-testid="store-listing-toggle">
        <span><PackagePlus /> 上架治理（PRD92：锚核验 → 审核 → 公开）</span>
        <small>只改 Store 可见性，不改链上事实</small>
      </button>
      {open ? (
        <div className="store-listing-body">
          <div className="store-listing-import" data-testid="store-listing-import">
            <input
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              placeholder="Plan ID（0x…64 位）"
              data-testid="store-listing-plan-id"
            />
            <input
              value={planHash}
              onChange={(event) => setPlanHash(event.target.value)}
              placeholder="Plan Hash（可选，导入后核验比对）"
              data-testid="store-listing-plan-hash"
            />
            <button
              className="primary-button"
              disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(planId.trim())}
              onClick={() => {
                const importPlanId = planId.trim();
                const importPlanHash = planHash.trim();
                void run(
                  () => api.importListing({
                    planId: importPlanId,
                    ...( /^0x[0-9a-fA-F]{64}$/.test(importPlanHash) ? { planHash: importPlanHash } : {}),
                  }),
                  "已导入；锚核验一致并通过审核后才公开",
                  () => {
                    setPlanId("");
                    setPlanHash("");
                  }
                );
              }}
              data-testid="store-listing-import-submit"
            >
              {busy ? <Loader2 className="spin" /> : null} 导入上架
            </button>
          </div>

          {message ? <p className="store-account-message" data-testid="store-listing-message">{message}</p> : null}
          {error ? <p className="store-account-message is-error" data-testid="store-listing-error">{error}</p> : null}

          {state.status === "loading" ? <p className="muted"><Loader2 className="spin" /> 正在读取上架列表…</p> : null}
          {state.status === "error" ? <p className="store-account-message is-error">{state.message}</p> : null}
          {state.status === "ready" ? (
            state.listings.length === 0 ? (
              <p className="muted">暂无上架记录。导入编译产物锚（planId / planHash）开始上架流。</p>
            ) : (
              <table className="store-data-table" data-testid="store-listing-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>状态</th>
                    <th>导入时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {state.listings.map((listing) => (
                    <tr key={listing.listingId} data-listing-status={listing.status}>
                      <td className="mono" title={listing.planId}>{shortValue(listing.planId)}</td>
                      <td>{listingStatusLabel(listing.status)}{listing.reviewNote ? <span className="muted">（{listing.reviewNote}）</span> : null}</td>
                      <td>{new Date(listing.importedAt).toLocaleString()}</td>
                      <td>
                        {listing.status === "imported" || listing.status === "rejected" ? (
                          <span className="store-listing-actions">
                            <button
                              className="primary-button"
                              disabled={busy}
                              onClick={() => void run(() => api.reviewListing(listing.listingId, "approve"), "已审核通过并公开")}
                              data-testid="store-listing-approve"
                            >
                              <ListChecks /> 审核公开
                            </button>
                            <button
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => void run(() => api.reviewListing(listing.listingId, "reject", "运营方驳回"), "已驳回")}
                            >
                              驳回
                            </button>
                          </span>
                        ) : null}
                        {listing.status === "public" ? (
                          <button
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => void run(() => api.delistListing(listing.listingId, "运营方下架"), "已下架：目录与搜索不可见，链上事实不变")}
                          >
                            下架
                          </button>
                        ) : null}
                        {listing.status === "delisted" ? (
                          <button
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => void run(() => api.relistListing(listing.listingId), "已重新上架")}
                          >
                            重新上架
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
