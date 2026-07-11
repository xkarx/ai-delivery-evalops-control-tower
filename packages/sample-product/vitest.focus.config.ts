import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@dailycart/schemas": `${root}packages/schemas/src/index.ts`,
      "@dailycart/connectors": `${root}packages/connectors/src/index.ts`,
      "@dailycart/sample-product": `${root}packages/sample-product/src/index.ts`
    }
  },
  test: {
    include: ["tests/connectors*.test.ts", "tests/sample-product*.test.ts"]
  }
});
