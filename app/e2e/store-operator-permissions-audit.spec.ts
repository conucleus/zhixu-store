import { expect, test } from "@playwright/test";
import { installWorkbenchRoutes } from "./workbench-stubs";

test("ordinary participant app does not expose Store operator identity, audit, or governance controls", async ({ page }) => {
  await installWorkbenchRoutes(page);
  await page.goto("/app");

  await expect(page.getByTestId("participant-app-page")).toBeVisible();
  await expect(page.getByTestId("store-app")).toHaveCount(0);
  await expect(page.getByText("Store audit")).toHaveCount(0);
  await expect(page.getByText("/store/audit")).toHaveCount(0);
});
