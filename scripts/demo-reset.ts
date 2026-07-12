import { pathToFileURL } from "node:url";
import path from "node:path";
import { resetDeterministicDemo } from "../apps/control-tower/lib/demo-runtime";

async function main(): Promise<void> {
  await resetDeterministicDemo({ root: path.resolve(import.meta.dirname, ".."), seed: Number(process.env.SYNTHETIC_DATA_SEED ?? 20260710), scenario: process.env.COMPANY_SCENARIO ?? "checkout-friction" });
  process.stdout.write("Demo reset complete: company data regenerated and runtime state cleared.\n");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
