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
  for (const route of ["/features", "/evals", "/reviews", "/releases", "/incidents", "/analytics", "/company", "/integrations", "/settings", "/product"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("customer product records a cart interaction", async ({ page }) => {
  await page.goto("/product");
  await expect(page.getByRole("heading", { name: "Good things for every day." })).toBeVisible();
  const addButtons = page.getByRole("button", { name: /Add to cart/ });
  await expect(addButtons).toHaveCount(8);
  await addButtons.nth(0).click();
  await expect(page.locator(".product-cart-button")).toContainText("1");
  await page.locator(".product-cart-button").click();
  await expect(page.getByRole("heading", { name: "Ready for checkout" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Checkout securely/ })).toBeVisible();
});
