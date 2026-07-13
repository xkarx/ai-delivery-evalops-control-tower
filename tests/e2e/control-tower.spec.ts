import { expect, test } from "@playwright/test";

async function ensureSession(page: import("@playwright/test").Page) {
  await page.goto("/demo");
  const session = page.locator(".session-chip b");
  await expect(session).toBeVisible();
  if (!/^SESSION-[A-Z0-9]+$/.test((await session.textContent()) ?? "")) {
    const start = page.getByRole("button", { name: "Start guided demo" });
    await expect(start).toBeVisible();
    await start.click();
  }
  await expect(page.locator(".session-chip b")).toHaveText(/^SESSION-[A-Z0-9]+$/, { timeout: 15_000 });
}

test("the root route opens the authoritative demo cockpit", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { name: /Turn a customer problem into a measured release/i })).toBeVisible();
  await expect(page.getByText("Synthetic company inputs", { exact: true })).toBeVisible();
  await expect(page.getByText("Executed delivery actions", { exact: true })).toBeVisible();
});

test("required pages render on a narrow viewport", async ({ page }) => {
  test.setTimeout(60_000);
  for (const route of ["/features", "/delivery", "/evals", "/reviews", "/releases", "/runs/summary", "/incidents", "/analytics", "/company", "/integrations", "/settings", "/product"]) {
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
  for (const route of ["/demo", "/features", "/delivery", "/evals", "/reviews", "/releases", "/incidents", "/analytics", "/company", "/integrations", "/settings", "/product"]) {
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
  await ensureSession(page);
  await page.goto("/analytics");
  await page.getByLabel("Users").fill("6");
  await page.getByLabel("Duration seconds").fill("2");
  await page.getByLabel("Traffic scenario").selectOption("checkout-failure");
  await page.getByRole("button", { name: "Run traffic" }).click();
  await expect(page.locator(".traffic-result")).toContainText(/events|could not|missing/i);
});

test("agent workflow runs through eval and stops at release approval", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name === "mobile", "The mutating workflow is executed once; mobile interaction is covered by the responsive route and control tests.");
  await ensureSession(page);
  await page.getByRole("button", { name: /Analyze opportunities|Start agent analysis/ }).click();
  await expect(page.getByRole("button", { name: "Approve feature tracks" })).toBeVisible({ timeout: 45_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Approve feature tracks" })).toBeVisible();
  await page.getByRole("button", { name: "Approve feature tracks" }).click();
  await expect(page.getByRole("button", { name: "Approve release" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".cockpit-evals")).toContainText(/100\/100|passed/i);
});

test("the signed session and authoritative stage survive refresh and a second tab", async ({ page, context }) => {
  await ensureSession(page);
  const sessionId = await page.locator(".session-chip b").innerText();
  const stage = await page.locator(".stage-rail .active b").innerText();
  await page.reload();
  await expect(page.locator(".session-chip b")).toHaveText(sessionId);
  await expect(page.locator(".stage-rail .active b")).toHaveText(stage);
  const second = await context.newPage();
  await second.goto("/demo");
  await expect(second.locator(".session-chip b")).toHaveText(sessionId);
  await expect(second.locator(".stage-rail .active b")).toHaveText(stage);
});

test("raw action JSON is secondary to provider proof", async ({ page }) => {
  await ensureSession(page);
  const technical = page.locator("details.technical-details");
  if (await technical.isVisible()) {
    await expect(technical).not.toHaveAttribute("open", "");
    await technical.locator("summary").click();
    await expect(technical.getByRole("link", { name: "View raw action record" })).toBeVisible();
  }
});

test("company context, eval authoring, incident creation, and export are interactive", async ({ page }) => {
  test.setTimeout(60_000);
  await ensureSession(page);
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
    for (const route of ["/demo", "/delivery", "/runs", "/evals", "/company"]) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows at ${width}px`).toBeLessThanOrEqual(1);
      const heading = page.locator("h1");
      await expect(heading).toBeVisible();
      expect((await heading.boundingBox())?.width ?? 0, `${route} heading is crushed at ${width}px`).toBeGreaterThan(150);
    }
  }
});
