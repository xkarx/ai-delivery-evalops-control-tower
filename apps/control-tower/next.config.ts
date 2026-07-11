import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The repository is also mirrored at the workspace root for the desktop
  // preview. Pin Next's asset/build root to this checkout so that duplicate
  // lockfiles cannot make CSS and static chunks resolve from the mirror.
  turbopack: {
    root: path.resolve(__dirname, "../..")
  },
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
