import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PREVIEW_BASE_URL;
if (!baseURL) throw new Error("PREVIEW_BASE_URL is required for preview-target browser evaluation.");

export default defineConfig({
  testDir: "./tests/preview-e2e",
  timeout: 45_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : undefined
  },
  projects: [{ name: "preview-chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-preview-report" }]]
});
