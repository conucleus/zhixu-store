// 工作台壳层：顶栏、运行横幅与空目录占位（原 ProductWorkbenchApp.tsx，纯搬迁）。
import { AlertTriangle, Bell, ChevronDown, RefreshCw, ShieldCheck } from "lucide-react";
import type { ProductView } from "./workbenchTypes";
import { EmptyState } from "./WorkbenchWidgets";

export function TopNav({
  active,
  onGo,
  participantName,
  openTaskCount
}: {
  active: string;
  onGo: (view: ProductView) => void;
  participantName?: string | undefined;
  openTaskCount?: number | undefined;
}) {
  const items: Array<{ label: string; view: ProductView; badge?: string }> = [
    { label: "订单工作台", view: "app" },
    { label: "秩序库", view: "home" },
    { label: "订单", view: "order" },
    ...(openTaskCount === undefined ? [{ label: "待办", view: "task" as const }] : [{ label: "待办", view: "task" as const, badge: String(openTaskCount) }]),
    { label: "执行方", view: "participants" },
    { label: "帮助", view: "home" }
  ];

  return (
    <header className="product-topbar">
      <button className="product-logo" onClick={() => onGo("home")}>
        <span className="product-logo-mark"><ShieldCheck /></span>
        <span className="product-logo-text"><strong>共同秩序</strong><small>订单工作台</small></span>
      </button>
      <nav className="product-nav" aria-label="主导航">
        {items.map((item) => (
          <button
            className={`product-nav-item ${active === item.label ? "is-active" : ""}`}
            key={item.label}
            onClick={() => onGo(item.view)}
          >
            {item.label}
            {item.badge ? <span className="product-nav-badge">{item.badge}</span> : null}
          </button>
        ))}
      </nav>
      <div className="product-userbar">
        <button className="icon-button" aria-label="通知"><Bell /></button>
        {participantName ? (
          <>
            <span className="avatar">{participantName.slice(0, 1)}</span>
            <span className="user-name">{participantName}</span>
          </>
        ) : null}
        <ChevronDown className="chevron" />
      </div>
    </header>
  );
}

export function RuntimeBanner({ syncing, degradedCount = 0 }: { syncing: boolean; degradedCount?: number | undefined }) {
  if (syncing) {
    return (
      <div className="runtime-banner is-syncing">
        <RefreshCw className="spin" />
        <div>
          <strong>订单状态同步中</strong>
          <p>后端正在同步最新确认结果，页面会展示当前可用状态。</p>
        </div>
      </div>
    );
  }
  if (degradedCount > 0) {
    // 部分接口失败但整体可用：如实提示降级，不装作数据完整。
    return (
      <div className="runtime-banner is-mock" data-testid="workbench-degraded-banner">
        <AlertTriangle />
        <div>
          <strong>部分接口返回异常</strong>
          <p>{degradedCount} 个接口加载失败，相关秩序或列表可能暂不可用；其余功能不受影响，可稍后重新加载。</p>
        </div>
      </div>
    );
  }
  return null;
}


export function EmptyCatalogPage() {
  return <EmptyState title="暂无可创建订单的秩序" desc="当前没有已审核且可用于创建新订单的秩序。" />;
}
