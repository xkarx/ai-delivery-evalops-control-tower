import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@dailycart/schemas",
    "@dailycart/config",
    "@dailycart/connectors",
    "@dailycart/workflow",
    "@dailycart/agents",
    "@dailycart/evals",
    "@dailycart/lineage",
    "@dailycart/sample-product"
  ]
};

export default nextConfig;
