import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | undefined;
}

/**
 * 应用级错误边界：子组件渲染抛错不再整页灰白（React 卸载整棵树的默认
 * 行为）。错误如实呈现——不吞错、不装成功、不自动重试；恢复导航只提供
 * 明确的整页动作（重载 / 回入口首页），因为边界无法判断崩溃的子树内部
 * 哪些状态还能被信任。
 */
export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("zhixu-store render error", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <main className="product-app" role="alert">
        <div className="product-main">
          <section className="warning-box">
            <strong>界面渲染出错</strong>
            <p>
              页面组件渲染时出错，已停止渲染并如实展示错误；没有提交、签名或链上动作被自动重试。
            </p>
          </section>
          <section className="state-panel error">
            <span>
              <AlertTriangle aria-hidden="true" />
            </span>
            <div>
              <h2>渲染错误</h2>
              <p>{error.message || String(error)}</p>
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => window.location.reload()}
                >
                  重新加载
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    // 回当前入口首页后整页重载：崩溃可能来自某个具体页面
                    // 子树，保留原路径重载可能立刻复现同一错误。
                    const home = window.location.pathname.startsWith("/store") ? "/store" : "/app";
                    window.location.assign(home);
                  }}
                >
                  回到首页
                </button>
              </div>
            </div>
          </section>
          {error.stack ? (
            <details className="error-boundary-stack">
              <summary>错误堆栈</summary>
              <pre>{error.stack}</pre>
            </details>
          ) : null}
        </div>
      </main>
    );
  }
}
