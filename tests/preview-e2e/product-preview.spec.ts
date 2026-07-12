import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/product");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("preview renders the feature-enabled DailyCart product", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Good things for every day." })).toBeVisible();
  await expect(page.locator(".product-footer")).toContainText("Recovery guidance");
  await expect(page.locator(".product-footer")).toContainText("persistent cart");
});

test("checkout interruption restores keyboard focus to the recovery message", async ({ page }) => {
  await page.getByRole("button", { name: /Add to cart/ }).first().click();
  await page.locator(".product-cart-button").click();
  await page.getByRole("button", { name: "Simulate interruption" }).click();
  const recoveryHeading = page.getByRole("heading", { name: "Your checkout was interrupted" });
  await expect(recoveryHeading).toBeVisible();
  await expect(recoveryHeading).toBeFocused();
  await page.getByRole("button", { name: /Restore checkout/ }).click();
  await expect(page.getByRole("heading", { name: "Ready for checkout" })).toBeVisible();
});

test("cart state survives a browser refresh and can be recovered", async ({ page }) => {
  await page.getByRole("button", { name: /Add to cart/ }).first().click();
  await expect(page.locator(".product-cart-button")).toContainText("1");
  await page.reload();
  await page.getByRole("button", { name: /Resume your saved cart/ }).click();
  await expect(page.locator(".product-cart-button")).toContainText("1");
});
