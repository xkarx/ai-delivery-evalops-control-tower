import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeProductEvidence, createPlanningAndDeliveryLineage, createTpmPlan, executeIndependentEngineeringWorkstreams, runEngineeringFeasibilityReview, runUxReview } from "../packages/agents/src/index";
import { runCriticalFailureRecoveryDemo, InMemoryEvalResultStore } from "../packages/evals/src/index";
import { generateTraffic } from "../packages/sample-product/src/traffic-engine";
import { fallbackDemoState } from "../apps/control-tower/lib/demo-state";
import { evidenceSchema, demoStateSchema, type Evidence } from "../packages/schemas/src/index";

const root = resolve(import.meta.dirname, "..");
const generated = resolve(root, "company/generated");
const artifacts = resolve(root, "artifacts");
async function main(): Promise<void> {
const evidence = JSON.parse(await readFile(resolve(generated, "research/evidence.json"), "utf8")) as unknown[];
const parsedEvidence = evidence.map((item) => evidenceSchema.parse(item));
const pm = analyzeProductEvidence(parsedEvidence as Evidence[], { runId: "RUN-0100", now: "2026-07-10T16:00:00.000Z", maxOpportunities: 3 });
const uxReview = runUxReview(pm.opportunities[0]!, pm.implementationBrief, { runId: "RUN-0110", now: "2026-07-10T16:05:00.000Z" });
const feasibilityReview = runEngineeringFeasibilityReview(pm.opportunities[0]!, pm.implementationBrief, { runId: "RUN-0111", now: "2026-07-10T16:07:00.000Z" });
const recommended = { ...pm.opportunities[0]!, status: "approved" as const };
const plan = createTpmPlan(recommended, { implementationBrief: pm.implementationBrief, runId: "RUN-0101", now: "2026-07-10T16:15:00.000Z", ticketStartOrdinal: 101 });
const workstreams = await executeIndependentEngineeringWorkstreams(recommended, plan.tickets, { runStartOrdinal: 102 });
const recovery = await runCriticalFailureRecoveryDemo(new InMemoryEvalResultStore());
const traffic = generateTraffic({
  userCount: 50,
  spawnRatePerSecond: 5,
  durationSeconds: 60,
  seed: 20260710,
  scenario: "checkout-failure",
  customerPoolSize: 50,
  costControls: { maxEstimatedUsd: 5, maxRuntimeSeconds: 60, costPerThousandEventsUsd: 0.2, maxEvents: 4_000 }
}, { runSequence: 1, sourceMode: "simulated" });
const state = structuredClone(fallbackDemoState);
state.generatedAt = "2026-07-10T18:30:00.000Z";
state.seed = 20260710;
state.scenario = "checkout-friction";
state.features = [recommended, ...state.features.slice(1)];
state.runs = [pm.run, uxReview.run, feasibilityReview.run, plan.run, ...workstreams.map((record) => record.run), ...state.runs.filter((run) => run.agent !== "pm" && run.agent !== "engineering" && run.agent !== "ux" && run.agent !== "engineering_feasibility")];
state.tickets = plan.tickets;
state.campaigns = [recovery.failed.campaign, recovery.corrected.campaign].map((campaign) => ({ ...campaign, featureId: recommended.id }));
state.funnel = traffic.funnel.map((stage) => ({ stage: stage.stage.replaceAll("_", " "), count: stage.count }));
state.lineage = createPlanningAndDeliveryLineage({ evidenceIds: recommended.evidenceIds, featureId: recommended.id, decisionId: "DEC-0001", prdId: plan.implementationBrief.id, tickets: plan.tickets, workstreams, createdAt: "2026-07-10T16:30:00.000Z" });
state.lineage.push(...recovery.failed.caseResults.slice(0, 2).map((stored, index) => ({ id: `LIN-${String(20 + index).padStart(4, "0")}`, sourceType: "eval_campaign", sourceId: recovery.failed.campaign.id, relationship: "executed_case", targetType: "eval_case", targetId: stored.case.id, createdAt: "2026-07-10T17:30:00.000Z", metadata: {} })));
state.activity = [{ at: "2026-07-10T18:30:00.000Z", type: "traffic", title: "Synthetic traffic generated", detail: `${traffic.events.length} measured product events · ${traffic.customerIds.length} persistent customers`, entityId: traffic.runId }, ...state.activity];
demoStateSchema.parse(state);
await mkdir(artifacts, { recursive: true });
await writeFile(resolve(artifacts, "demo-state.json"), `${JSON.stringify(state, null, 2)}\n`);
await writeFile(resolve(artifacts, "runtime-summary.json"), `${JSON.stringify({ pmRun: pm.run.id, recommendation: recommended.id, workstreams: workstreams.map((item) => item.run.id), blockedCampaign: recovery.failed.campaign.id, passedCampaign: recovery.corrected.campaign.id, trafficRun: traffic.runId }, null, 2)}\n`);
await writeFile(resolve(artifacts, "workflow-reviews.json"), `${JSON.stringify({ featureId: recommended.id, implementationBrief: pm.implementationBrief, uxReview, feasibilityReview }, null, 2)}\n`);
console.log(`Demo executed: ${recommended.id} recommended; ${recovery.failed.campaign.id} blocked; ${recovery.corrected.campaign.id} passed.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
