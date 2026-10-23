import { useEffect } from "react";
import { StoreApp } from "../store/StoreApp";

/**
 * 本应用只剩 operator 面：任何路径都进 Store Console。
 *
 * - `/` 规整为 `/store`（历史书签与根路径统一落点）；
 * - `?join=` / `?share=` 链接入口由 StoreApp 消费，路径仍是 `/store`；
 * - participant 工作台（订单/待办/证据/签名）属于订单 app，本站不再挂载：
 *   `src/product/**` 仅为迁移冻结保留，入口已从路由移除。
 */
export default function App() {
  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname === "/store") {
      return;
    }
    window.history.replaceState(null, "", `/store${window.location.search}${window.location.hash}`);
  }, []);

  return (
    <div className="product-app" data-testid="store-entry">
      <main className="product-main">
        <StoreApp />
      </main>
    </div>
  );
}
