import { useEffect } from "react";
import { ProductWorkbenchApp } from "./ProductWorkbenchApp";
import { readLocalStorage, readQueryValue } from "./shared/frontend";
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
  return isStoreOperatorModeSelected() ? "store" : "participant";
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function isStoreOperatorModeSelected(): boolean {
  const accessLevel = (
    import.meta.env.VITE_UVP_STORE_ACCESS_LEVEL ??
      readQueryValue("storeAccess") ??
      readQueryValue("storeRole") ??
      readLocalStorage("uvp.store.accessLevel") ??
      ""
  ).trim().toLowerCase();
  return accessLevel === "store_operator" ||
    accessLevel === "operator" ||
    accessLevel === "store_admin" ||
    accessLevel === "admin";
}
