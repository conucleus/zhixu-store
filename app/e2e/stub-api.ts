/**
 * e2e 桩 API 基地址：与 playwright.config.ts 中 VITE_UVP_CHAIN_SERVICES_URL
 * 一致的不可达地址。未打入 page.route 的请求立即网络失败（fail-closed），
 * 各 spec 只注入自己需要的 /store/** 响应。
 */
export const STUB_API_BASE = "http://127.0.0.1:9";
