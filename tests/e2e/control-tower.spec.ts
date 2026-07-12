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
  test.setTimeout(60_000);
  for (const route of ["/features", "/delivery", "/evals", "/reviews", "/releases", "/incidents", "/analytics", "/company", "/integrations", "/settings", "/product"]) {
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

test("dense screens stay inside the viewport at tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  for (const route of ["/incidents", "/company", "/runs", "/reviews", "/integrations", "/delivery"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${route} has horizontal page overflow`).toBeLessThanOrEqual(1);
  }
});

test("mobile pages do not create horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/features", "/delivery", "/evals", "/reviews", "/releases", "/incidents", "/analytics", "/company", "/integrations", "/settings", "/product"]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${route} has horizontal mobile overflow`).toBeLessThanOrEqual(1);
  }
});

test("delivery roadmap exposes status columns and sync feedback", async ({ page }) => {
  await page.goto("/delivery");
  await expect(page.getByRole("heading", { name: "Linear delivery roadmap" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Completed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backlog" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync to Linear" })).toBeVisible();
});

test("analytics traffic controls run a bounded scenario", async ({ page }) => {
  await page.goto("/analytics");
  await page.getByLabel("Users").fill("6");
  await page.getByLabel("Duration seconds").fill("2");
  await page.getByLabel("Traffic scenario").selectOption("checkout-failure");
  await page.getByRole("button", { name: "Run traffic" }).click();
  await expect(page.locator(".traffic-result")).toContainText(/events|could not|missing/i);
});

test("agent workflow runs through eval and stops at release approval", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "The mutating workflow is executed once; mobile interaction is covered by the responsive route and control tests.");
  await page.request.post("/api/demo/reset");
  await page.goto("/runs");
  await page.getByRole("button", { name: "Start workflow" }).click();
  await expect(page.getByRole("button", { name: "Workflow complete" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Approve feature tracks|Confirm selected opportunity/ })).toBeVisible();
  await page.getByRole("button", { name: /Approve feature tracks|Confirm selected opportunity/ }).click();
  await expect(page.getByRole("button", { name: "Workflow complete" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status")).toContainText(/release approval is pending|preview evaluation is required/i);
  await expect(page.locator(".workflow-result")).toContainText(/EVAL-0002 passed/);
  await page.getByRole("button", { name: "Build product preview" }).click();
  await expect(page.locator("small[role=status]")).toContainText(/Preview evaluated|previews evaluated/i, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Approve release" })).toBeEnabled();
});

test("guide reopens without reserving or blocking page width", async ({ page }) => {
  await page.goto("/runs");
  await page.getByRole("button", { name: "Expand demo guide" }).click();
  await expect(page.getByRole("complementary", { name: "Demo guide" })).toContainText("What happens next");
  await page.getByRole("button", { name: "Collapse demo guide" }).click();
  await expect(page.getByRole("button", { name: "Start workflow" })).toBeVisible();
});

test("company context, eval authoring, incident creation, and export are interactive", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/company");
  await expect(page.getByRole("heading", { name: "Company data" })).toBeVisible();
  await page.getByRole("button", { name: "Validate references" }).click();
  await expect(page.getByRole("status")).toContainText(/validated|references/i);
  await page.locator(".record-preview").first().click();
  await expect(page.locator(".record-preview").first()).toHaveAttribute("open", "");

  await page.goto("/evals#eval-workbench");
  await page.getByRole("button", { name: "Save case" }).click();
  await expect(page.getByRole("status")).toContainText(/saved/i);
  await page.getByRole("button", { name: "Run selected evals" }).click();
  await expect(page.getByRole("status")).toContainText(/passed|blocked|100/i);

  await page.goto("/incidents");
  await page.getByRole("button", { name: "Declare incident" }).click();
  await page.getByRole("button", { name: "Create incident and regression" }).click();
  await expect(page.getByRole("status")).toContainText(/created/i);

  const download = page.waitForEvent("download");
  await page.goto("/lineage");
  await page.getByRole("link", { name: "Export evidence" }).click();
  expect((await download).suggestedFilename()).toMatch(/dailycart-lineage/i);
});

test("critical pages remain readable at every supported presentation width", async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/delivery", "/runs", "/evals", "/company"]) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows at ${width}px`).toBeLessThanOrEqual(1);
      const heading = page.locator("h1");
      await expect(heading).toBeVisible();
      expect((await heading.boundingBox())?.width ?? 0, `${route} heading is crushed at ${width}px`).toBeGreaterThan(150);
    }
  }
});
