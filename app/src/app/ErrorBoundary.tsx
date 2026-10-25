import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | undefined;
}

/* 应用级错误边界：如实呈现渲染错误，只提供整页恢复动作，不自动重试。 */
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
                    window.location.assign("/store");
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
