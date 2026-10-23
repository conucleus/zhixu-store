import { useEffect } from "react";
import { StoreApp } from "../store/StoreApp";

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
