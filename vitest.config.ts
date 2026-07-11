import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@dailycart/schemas": resolve(__dirname, "packages/schemas/src/index.ts"),
      "@dailycart/connectors": resolve(__dirname, "packages/connectors/src/index.ts"),
      "@dailycart/lineage": resolve(__dirname, "packages/lineage/src/index.ts"),
      "@dailycart/workflow": resolve(__dirname, "packages/workflow/src/index.ts"),
      "@dailycart/agents": resolve(__dirname, "packages/agents/src/index.ts"),
      "@dailycart/evals": resolve(__dirname, "packages/evals/src/index.ts"),
      "@dailycart/sample-product": resolve(__dirname, "packages/sample-product/src/index.ts"),
      "@dailycart/config": resolve(__dirname, "packages/config/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "scripts/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] }
  }
});
