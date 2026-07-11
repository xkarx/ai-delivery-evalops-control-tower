import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { demoStateSchema } from "../packages/schemas/src/index";

async function main(): Promise<void> {
  const state = demoStateSchema.parse(JSON.parse(await readFile(resolve(import.meta.dirname, "../artifacts/demo-state.json"), "utf8")));
  const blocked = state.campaigns.find((campaign) => campaign.status === "blocked");
  const passed = state.campaigns.find((campaign) => campaign.releaseAllowed);
  if (!blocked || !passed) throw new Error("Demo verification requires both a blocked and a passing campaign");
  if (state.runs.filter((run) => run.agent === "engineering").length < 2) throw new Error("Demo verification requires two engineering workstreams");
  if (!state.lineage.some((edge) => edge.relationship === "executed_by")) throw new Error("Demo verification requires delivery lineage");
  console.log(`Demo verified: ${state.features.length} features, ${state.runs.length} runs, blocked ${blocked.id}, passed ${passed.id}.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
