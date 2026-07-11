import { expect, test } from "@playwright/test";

test("overview exposes the evidence-to-release story", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good afternoon, operator/i })).toBeVisible();
  await expect(page.getByText("Release gate recovery demonstrated")).toBeVisible();
  await page.getByRole("link", { name: "Open complete feature lineage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Feature lineage" })).toBeVisible();
  await expect(page.locator(".lineage-timeline").getByText("EVAL-0001", { exact: true })).toBeVisible();
});

test("required pages render on a narrow viewport", async ({ page }) => {
  for (const route of ["/features", "/evals", "/reviews", "/releases", "/incidents", "/analytics", "/company", "/integrations", "/settings"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
  }
});
