import { pathToFileURL } from "node:url";
import path from "node:path";
import { runDeterministicDemo } from "../apps/control-tower/lib/demo-runtime";

async function main(): Promise<void> {
  const result = await runDeterministicDemo({ root: path.resolve(import.meta.dirname, ".."), seed: Number(process.env.SYNTHETIC_DATA_SEED ?? 20260710), scenario: process.env.COMPANY_SCENARIO ?? "checkout-friction" });
  process.stdout.write(`Demo executed: ${result.recommendation} recommended; ${result.blockedCampaign} blocked; ${result.passedCampaign} passed.\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
