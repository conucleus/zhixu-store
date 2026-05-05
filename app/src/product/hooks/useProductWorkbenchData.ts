import { useCallback, useEffect, useState } from "react";
import {
  WorkbenchLoadError,
  type ProductApiClient,
  type ProductApiSource,
  type ProductWorkbenchData,
  type WorkbenchEndpointDiagnostic
} from "../api";

export type ProductWorkbenchLoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: ProductWorkbenchData }
  | { readonly status: "empty"; readonly data: ProductWorkbenchData }
  | { readonly status: "error"; readonly message: string; readonly source?: ProductApiSource }
  | { readonly status: "diagnostic"; readonly diagnostics: readonly WorkbenchEndpointDiagnostic[]; readonly source: ProductApiSource };

export function useProductWorkbenchData(api: ProductApiClient): {
  readonly loadState: ProductWorkbenchLoadState;
  readonly reload: () => Promise<void>;
} {
  const [loadState, setLoadState] = useState<ProductWorkbenchLoadState>({ status: "loading" });

  const reload = useCallback(async () => {
    setLoadState({ status: "loading" });
    try {
      const loaded = await api.loadWorkbenchData();
      setLoadState({
        status: loaded.zhixus.length === 0 ? "empty" : "ready",
        data: loaded
      });
    } catch (error) {
      if (error instanceof WorkbenchLoadError) {
        setLoadState({
          status: "diagnostic",
          diagnostics: error.diagnostics,
          source: error.source
        });
      } else {
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "工作台加载失败"
        });
      }
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    setLoadState({ status: "loading" });
    void api.loadWorkbenchData().then((loaded) => {
      if (!cancelled) {
        setLoadState({
          status: loaded.zhixus.length === 0 ? "empty" : "ready",
          data: loaded
        });
      }
    }).catch((error) => {
      if (!cancelled) {
        if (error instanceof WorkbenchLoadError) {
          setLoadState({
            status: "diagnostic",
            diagnostics: error.diagnostics,
            source: error.source
          });
        } else {
          setLoadState({
            status: "error",
            message: error instanceof Error ? error.message : "工作台加载失败"
          });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return { loadState, reload };
}
