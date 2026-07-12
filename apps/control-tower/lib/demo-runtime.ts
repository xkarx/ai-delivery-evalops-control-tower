import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeProductEvidence, createPlanningAndDeliveryLineage, createTpmPlan, executeIndependentEngineeringWorkstreams, runEngineeringFeasibilityReview, runUxReview } from "@dailycart/agents";
import { runCriticalFailureRecoveryDemo, InMemoryEvalResultStore } from "@dailycart/evals";
import { generateTraffic } from "../../../packages/sample-product/src/traffic-engine";
import { evidenceSchema, demoStateSchema, type Evidence } from "@dailycart/schemas";
import { fallbackDemoState } from "./demo-state";
import { embeddedDemoEvidence } from "./demo-evidence";
import { generateCompany } from "../../../scripts/generate-company";

export interface DemoRuntimeOptions {
  root: string;
  now?: string;
  seed?: number;
  scenario?: string;
}

export async function runDeterministicDemo(options: DemoRuntimeOptions): Promise<{ recommendation: string; blockedCampaign: string; passedCampaign: string; trafficRun: string; persisted: boolean }> {
  const generated = path.resolve(options.root, "company/generated");
  const artifacts = path.resolve(options.root, "artifacts");
  const timestamp = options.now ?? "2026-07-10T18:30:00.000Z";
  const seed = options.seed ?? 20260710;
  const evidence = await readEvidence(generated);
  const parsedEvidence = evidence.map((item) => evidenceSchema.parse(item));
  const pm = analyzeProductEvidence(parsedEvidence as Evidence[], { runId: "RUN-0100", now: "2026-07-10T16:00:00.000Z", maxOpportunities: 3 });
  const uxReview = runUxReview(pm.opportunities[0]!, pm.implementationBrief, { runId: "RUN-0110", now: "2026-07-10T16:05:00.000Z" });
  const feasibilityReview = runEngineeringFeasibilityReview(pm.opportunities[0]!, pm.implementationBrief, { runId: "RUN-0111", now: "2026-07-10T16:07:00.000Z" });
  const recommended = { ...pm.opportunities[0]!, status: "approved" as const };
  const plan = createTpmPlan(recommended, { implementationBrief: pm.implementationBrief, runId: "RUN-0101", now: "2026-07-10T16:15:00.000Z", ticketStartOrdinal: 101 });
  const workstreams = await executeIndependentEngineeringWorkstreams(recommended, plan.tickets, { runStartOrdinal: 102 });
  const recovery = await runCriticalFailureRecoveryDemo(new InMemoryEvalResultStore());
  const traffic = generateTraffic({ userCount: 50, spawnRatePerSecond: 5, durationSeconds: 60, seed, scenario: "checkout-failure", customerPoolSize: 50, costControls: { maxEstimatedUsd: 5, maxRuntimeSeconds: 60, costPerThousandEventsUsd: 0.2, maxEvents: 4_000 } }, { runSequence: 1, sourceMode: "simulated" });
  const state = structuredClone(fallbackDemoState);
  state.generatedAt = timestamp;
  state.seed = seed;
  state.scenario = options.scenario ?? "checkout-friction";
  state.features = [recommended, ...state.features.slice(1)];
  state.runs = [pm.run, uxReview.run, feasibilityReview.run, plan.run, ...workstreams.map((record) => record.run), ...state.runs.filter((run) => !["pm", "engineering", "ux", "engineering_feasibility"].includes(run.agent))];
  state.tickets = plan.tickets;
  state.campaigns = [recovery.failed.campaign, recovery.corrected.campaign].map((campaign) => ({ ...campaign, featureId: recommended.id }));
  state.funnel = traffic.funnel.map((stage) => ({ stage: stage.stage.replaceAll("_", " "), count: stage.count }));
  state.lineage = createPlanningAndDeliveryLineage({ evidenceIds: recommended.evidenceIds, featureId: recommended.id, decisionId: "DEC-0001", prdId: plan.implementationBrief.id, tickets: plan.tickets, workstreams, createdAt: "2026-07-10T16:30:00.000Z" });
  state.lineage.push(...recovery.failed.caseResults.slice(0, 2).map((stored, index) => ({ id: `LIN-${String(20 + index).padStart(4, "0")}`, sourceType: "eval_campaign", sourceId: recovery.failed.campaign.id, relationship: "executed_case", targetType: "eval_case", targetId: stored.case.id, createdAt: "2026-07-10T17:30:00.000Z", metadata: {} })));
  state.activity = [{ at: timestamp, type: "traffic", title: "Synthetic traffic generated", detail: `${traffic.events.length} measured product events · ${traffic.customerIds.length} persistent customers`, entityId: traffic.runId }, ...state.activity];
  demoStateSchema.parse(state);
  let persisted = true;
  try {
    await mkdir(artifacts, { recursive: true });
    await writeFile(path.resolve(artifacts, "demo-state.json"), `${JSON.stringify(state, null, 2)}\n`);
    await writeFile(path.resolve(artifacts, "runtime-summary.json"), `${JSON.stringify({ pmRun: pm.run.id, recommendation: recommended.id, workstreams: workstreams.map((item) => item.run.id), blockedCampaign: recovery.failed.campaign.id, passedCampaign: recovery.corrected.campaign.id, trafficRun: traffic.runId }, null, 2)}\n`);
    await writeFile(path.resolve(artifacts, "workflow-reviews.json"), `${JSON.stringify({ featureId: recommended.id, implementationBrief: pm.implementationBrief, uxReview, feasibilityReview }, null, 2)}\n`);
  } catch (error) {
    persisted = false;
    console.warn("Demo artifacts could not be persisted; continuing with the computed run result.", error instanceof Error ? error.message : String(error));
  }
  return { recommendation: recommended.id, blockedCampaign: recovery.failed.campaign.id, passedCampaign: recovery.corrected.campaign.id, trafficRun: traffic.runId, persisted };
}

async function readEvidence(generated: string): Promise<unknown[]> {
  try {
    return JSON.parse(await readFile(path.resolve(generated, "research/evidence.json"), "utf8")) as unknown[];
  } catch {
    return embeddedDemoEvidence;
  }
}

export async function resetDeterministicDemo(options: DemoRuntimeOptions): Promise<void> {
  const artifacts = path.resolve(options.root, "artifacts");
  const runtime = path.resolve(artifacts, "runtime");
  await rm(runtime, { recursive: true, force: true });
  await rm(path.resolve(artifacts, "demo-state.json"), { force: true });
  await rm(path.resolve(artifacts, "workflow-run.json"), { force: true });
  await Promise.all(["workflow-reviews.json", "workflow-preview.json", "workflow-preview-eval.json", "workflow-external-sync.json", "linear-delivery-sync.json", "agent-handoffs.jsonl", "slack-command-events.jsonl"].map((file) => rm(path.resolve(artifacts, file), { force: true })));
  try {
    await mkdir(runtime, { recursive: true });
    await writeFile(path.resolve(runtime, "reset.json"), JSON.stringify({ resetAt: options.now ?? new Date().toISOString(), mode: "synthetic" }, null, 2));
    await generateCompany({ seed: options.seed ?? Number(process.env.SYNTHETIC_DATA_SEED ?? 20260710), scenario: options.scenario ?? process.env.COMPANY_SCENARIO ?? "checkout-friction", outputDirectory: path.resolve(options.root, "company/generated") });
  } catch (error) {
    console.warn("Demo reset artifacts could not be persisted; continuing with the embedded hosted fixture.", error instanceof Error ? error.message : String(error));
  }
}
