import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const host = "127.0.0.1";
const port = process.env.UVP_PRODUCT_BROWSER_E2E_PORT ?? "4173";
const runRoot = process.env.UVP_STORE_E2E_RUN_ROOT;
const mode = process.env.UVP_PRODUCT_BROWSER_E2E_MODE ?? "fixture";
const chainBackedMode = mode === "full" || mode === "base-sepolia" || mode === "testnet";
// Store 访问级别按需注入（如 store_operator）：供试拼沙箱写路径 e2e 使用独立端口/profile 运行。
const storeAccessLevel = process.env.UVP_PRODUCT_BROWSER_E2E_STORE_ACCESS_LEVEL;
// fixture 模式：
// - VITE_UVP_CHAIN_SERVICES_URL 指向不可达地址：任何未被打桩的请求立即网络失败
//   （fail-closed），需要页面数据的用例通过 page.route 注入响应。
// （Store Console 的 E2E 观测桥已按 ND-1 删除，不再需要 VITE_UVP_PRODUCT_E2E。）
const fixtureDevEnv = chainBackedMode
  ? ""
  : `VITE_UVP_CHAIN_SERVICES_URL=http://127.0.0.1:9 ${storeAccessLevel ? `VITE_UVP_STORE_ACCESS_LEVEL=${storeAccessLevel} ` : ""}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`;
const htmlReportDir = process.env.PLAYWRIGHT_HTML_REPORT ??
  (runRoot ? resolve(runRoot, "playwright-report") : "playwright-report");
const jsonReportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ??
  (runRoot ? resolve(runRoot, "playwright-results.json") : undefined);

const reporter = [
  ["list"],
  ["html", { outputFolder: htmlReportDir, open: "never" }]
] satisfies NonNullable<ReturnType<typeof defineConfig>["reporter"]>;

if (jsonReportPath) {
  reporter.push(["json", { outputFile: jsonReportPath }]);
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: chainBackedMode ? 180_000 : 45_000,
  expect: {
    timeout: 8_000
  },
  outputDir: runRoot ? resolve(runRoot, "test-results") : "test-results/e2e",
  reporter,
  use: {
    baseURL,
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: chainBackedMode ? "on" : "retain-on-failure",
    video: "retain-on-failure"
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `${fixtureDevEnv}pnpm dev --host ${host} --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
