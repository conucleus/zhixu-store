import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { listingImportGate, StoreListingImportEntry } from "./StoreListingPanel";

const validPlanId = `0x${"ab".repeat(32)}`;

describe("上架导入入口的锚定门（与服务端导入分支同口径）", () => {
  it("未锚定会话：入口不可用且给出锚定指引", () => {
    const gate = listingImportGate({ anchored: false, planId: validPlanId });
    assert.equal(gate.disabled, true);
    assert.equal(gate.anchorBlocked, true);
  });

  it("已锚定会话：Plan ID 完整时入口可用", () => {
    const gate = listingImportGate({ anchored: true, planId: validPlanId });
    assert.equal(gate.disabled, false);
    assert.equal(gate.anchorBlocked, false);
  });

  it("已锚定会话：Plan ID 不完整仍不可用，但不归于锚定原因", () => {
    const gate = listingImportGate({ anchored: true, planId: "0x1234" });
    assert.equal(gate.disabled, true);
    assert.equal(gate.anchorBlocked, false);
  });
});

function renderImportEntry(input: { readonly anchored: boolean; readonly planId: string }): string {
  return renderToStaticMarkup(createElement(StoreListingImportEntry, {
    anchored: input.anchored,
    busy: false,
    onImport: () => undefined,
    onPlanHashChange: () => undefined,
    onPlanIdChange: () => undefined,
    planHash: "",
    planId: input.planId
  }));
}

describe("StoreListingImportEntry 渲染", () => {
  it("运营方会话未锚定：导入按钮为不可用态并渲染指引文案", () => {
    const markup = renderImportEntry({ anchored: false, planId: validPlanId });
    const submit = /<button[^>]*data-testid="store-listing-import-submit"[^>]*>/.exec(markup);
    assert.ok(submit, "导入按钮应渲染");
    assert.match(submit[0], /disabled/, "未锚定时导入按钮应不可用");
    assert.match(markup, /store-listing-anchor-note/);
    assert.match(markup, /导入需先锚定门店会话/);
  });

  it("锚定后恢复：按钮可用且指引消失", () => {
    const markup = renderImportEntry({ anchored: true, planId: validPlanId });
    const submit = /<button[^>]*data-testid="store-listing-import-submit"[^>]*>/.exec(markup);
    assert.ok(submit, "导入按钮应渲染");
    assert.doesNotMatch(submit[0], /disabled/, "锚定后导入按钮应恢复可用");
    assert.doesNotMatch(markup, /store-listing-anchor-note/, "锚定后不应再渲染锚定指引");
  });
});
