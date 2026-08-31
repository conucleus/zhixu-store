import { useEffect } from "react";
import { ProductWorkbenchApp } from "./ProductWorkbenchApp";
import { configuredStoreAccessLevel } from "./store/api";
import { StoreApp } from "./store/StoreApp";

type FrontendEntry = "participant" | "store";

export default function App() {
  const entry = selectEntry();

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/") {
      return;
    }
    const pathname = entry === "store" ? "/store" : "/app";
    window.history.replaceState(null, "", `${pathname}${window.location.search}${window.location.hash}`);
  }, [entry]);

  if (entry === "store") {
    return (
      <div className="product-app" data-testid="store-entry">
        <main className="product-main">
          <StoreApp productHref="/app" />
        </main>
      </div>
    );
  }

  return <ProductWorkbenchApp />;
}

function selectEntry(): FrontendEntry {
  if (typeof window === "undefined") {
    return defaultEntry();
  }

  const pathname = normalizePathname(window.location.pathname);
  if (pathname === "/store" || pathname.startsWith("/store/")) {
    return "store";
  }
  if (pathname === "/app" || pathname.startsWith("/app/") || pathname === "/orders" || pathname.startsWith("/orders/")) {
    return "participant";
  }
  if (pathname === "/") {
    return defaultEntry();
  }
  return "participant";
}

/** 入口默认值与 resolveStoreAccess 同源：只认显式环境配置的访问级别。 */
function defaultEntry(): FrontendEntry {
  const configured = (import.meta.env.VITE_UVP_FRONTEND_ENTRY ?? import.meta.env.VITE_UVP_APP_ENTRY ?? "")
    .trim()
    .toLowerCase();
  if (configured === "store" || configured === "store_console" || configured === "store-console") {
    return "store";
  }
  if (configured === "participant" || configured === "app" || configured === "orders") {
    return "participant";
  }
  const level = configuredStoreAccessLevel();
  return level === "store_operator" || level === "store_admin" ? "store" : "participant";
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}
