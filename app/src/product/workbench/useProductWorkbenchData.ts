import { useCallback, useEffect, useRef, useState } from "react";
import {
  WorkbenchLoadError,
  type ProductApiClient,
  type ProductApiSource,
  type ProductWorkbenchData,
  type WorkbenchEndpointDiagnostic
} from "../api";

export type ProductWorkbenchLoadState =
  | { readonly status: "loading" }
  | { readonly status: "unauthenticated" }
  | { readonly status: "ready"; readonly data: ProductWorkbenchData }
  | { readonly status: "empty"; readonly data: ProductWorkbenchData }
  | { readonly status: "error"; readonly message: string; readonly source?: ProductApiSource }
  | { readonly status: "diagnostic"; readonly diagnostics: readonly WorkbenchEndpointDiagnostic[]; readonly source: ProductApiSource };

/**
 * 参与者面在非 local 部署强制钱包会话锚定：无会话时关键接口全部 401
 * （wallet_identity_required）。这不是诊断可排查的服务端异常，重试同一
 * 无会话请求只会再吃一次 401——按"未登录"分流给登录入口。
 */
function isUnauthenticatedLoadFailure(error: unknown): boolean {
  if (error instanceof WorkbenchLoadError) {
    return error.diagnostics.length > 0 && error.diagnostics.every((diag) => diag.status === 401);
  }
  const status = (error as { readonly status?: unknown }).status;
  return status === 401;
}

function loadStateFromError(error: unknown): ProductWorkbenchLoadState {
  if (isUnauthenticatedLoadFailure(error)) {
    return { status: "unauthenticated" };
  }
  if (error instanceof WorkbenchLoadError) {
    return { status: "diagnostic", diagnostics: error.diagnostics, source: error.source };
  }
  return { status: "error", message: error instanceof Error ? error.message : "工作台加载失败" };
}

export function useProductWorkbenchData(api: ProductApiClient): {
  readonly loadState: ProductWorkbenchLoadState;
  readonly reload: () => Promise<void>;
  /**
   * 定向刷新：mutation 成功后原地重新拉取投影。
   * 成功时原地更新数据并返回本次加载的投影（调用方可用它判断链上投影是否
   * 已落地）；失败时保留最后一次成功加载的数据（不把用户打回加载/诊断态）
   * 并返回 undefined。只在成功回调里触发一次，不会形成循环。
   */
  readonly refresh: () => Promise<ProductWorkbenchData | undefined>;
} {
  const [loadState, setLoadState] = useState<ProductWorkbenchLoadState>({ status: "loading" });
  // 慢网下旧响应不得覆盖新响应：所有加载路径共用单调序号，晚到响应作废。
  const loadSequenceRef = useRef(0);

  const reload = useCallback(async () => {
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setLoadState({ status: "loading" });
    try {
      const loaded = await api.loadWorkbenchData();
      if (loadSequenceRef.current !== sequence) {
        return;
      }
      setLoadState({
        status: loaded.zhixus.length === 0 ? "empty" : "ready",
        data: loaded
      });
    } catch (error) {
      if (loadSequenceRef.current !== sequence) {
        return;
      }
      setLoadState(loadStateFromError(error));
    }
  }, [api]);

  const refresh = useCallback(async (): Promise<ProductWorkbenchData | undefined> => {
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    try {
      const loaded = await api.loadWorkbenchData();
      if (loadSequenceRef.current !== sequence) {
        // 已有更新的加载接管状态：本次结果既不落地也不作为"最新投影"上报。
        return undefined;
      }
      setLoadState({
        status: loaded.zhixus.length === 0 ? "empty" : "ready",
        data: loaded
      });
      return loaded;
    } catch {
      // 刷新失败保留当前投影：页面继续展示最后一次成功加载的数据。
      return undefined;
    }
  }, [api]);

  useEffect(() => {
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setLoadState({ status: "loading" });
    void api.loadWorkbenchData().then((loaded) => {
      if (loadSequenceRef.current !== sequence) {
        return;
      }
      setLoadState({
        status: loaded.zhixus.length === 0 ? "empty" : "ready",
        data: loaded
      });
    }).catch((error) => {
      if (loadSequenceRef.current !== sequence) {
        return;
      }
      setLoadState(loadStateFromError(error));
    });
  }, [api]);

  return { loadState, reload, refresh };
}
