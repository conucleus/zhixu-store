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
  /**
   * 定向刷新：mutation 成功后原地重新拉取投影。
   * 成功时原地更新数据；失败时保留最后一次成功加载的数据（不把用户打回加载/诊断态），
   * 因此只会在成功回调里触发一次，不会形成循环。
   */
  readonly refresh: () => Promise<void>;
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

  const refresh = useCallback(async () => {
    try {
      const loaded = await api.loadWorkbenchData();
      setLoadState({
        status: loaded.zhixus.length === 0 ? "empty" : "ready",
        data: loaded
      });
    } catch {
      // 刷新失败保留当前投影：页面继续展示最后一次成功加载的数据。
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

  return { loadState, reload, refresh };
}
