import { expect, type Page } from "@playwright/test";

export const forbiddenOrdinaryTerms = [
  { label: "ABI", pattern: /\bABI\b/i },
  { label: "HookReady", pattern: /HookReady/i },
  { label: "sourceId", pattern: /sourceId/i },
  { label: "raw calldata", pattern: /raw calldata/i },
  { label: "gas", pattern: /\bgas\b/i },
  { label: "registryAddress", pattern: /registryAddress/i }
] as const;

export async function assertOrdinaryPageCopy(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  for (const term of forbiddenOrdinaryTerms) {
    expect(text, `ordinary UI should not expose ${term.label}`).not.toMatch(term.pattern);
  }
}

export async function expectWorkbenchSource(page: Page, source: "mock" | "real"): Promise<void> {
  await expect(page.getByTestId("product-workbench")).toHaveAttribute("data-uvp-source", source);
}
