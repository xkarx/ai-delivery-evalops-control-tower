import { rm, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateCompany } from "./generate-company";

const root = resolve(import.meta.dirname, "..");
const runtime = resolve(root, "artifacts/runtime");
const artifacts = resolve(root, "artifacts");

async function main(): Promise<void> {
  await rm(runtime, { recursive: true, force: true });
  await rm(resolve(artifacts, "demo-state.json"), { force: true });
  await rm(resolve(artifacts, "workflow-run.json"), { force: true });
  await Promise.all(["workflow-reviews.json", "workflow-preview.json", "workflow-preview-eval.json", "workflow-external-sync.json", "linear-delivery-sync.json", "agent-handoffs.jsonl", "slack-command-events.jsonl"].map((file) => rm(resolve(artifacts, file), { force: true })));
  await mkdir(runtime, { recursive: true });
  await writeFile(resolve(runtime, "reset.json"), JSON.stringify({ resetAt: "2026-07-10T18:30:00.000Z", mode: "synthetic" }, null, 2));
  await generateCompany({ seed: Number(process.env.SYNTHETIC_DATA_SEED ?? 20260710), scenario: process.env.COMPANY_SCENARIO ?? "checkout-friction" });
  console.log("Demo reset complete: company data regenerated and runtime state cleared.");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
