import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeProductEvidence, createPlanningAndDeliveryLineage, createTpmPlan, executeIndependentEngineeringWorkstreams } from "@dailycart/agents";
import { runCriticalFailureRecoveryDemo } from "@dailycart/evals";
import { DeliveryWorkflow } from "@dailycart/workflow";
import { agentRunSchema, assertDemoState, decisionSchema, evidenceSchema, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUN_KEY = "v1-workflow-seeded";
const WORKFLOW_ARTIFACT = "workflow-run.json";
const now = "2026-07-10T19:00:00.000Z";

type StoredWorkflowRun = {
  key: string;
  createdAt: string;
  reused?: boolean;
  phase: string;
  sourceMode: "simulated";
  featureId: string;
  featureTitle: string;
  ticketIds: string[];
  engineeringRunIds: string[];
  blockedCampaignId: string;
  passedCampaignId: string;
  releaseApprovalId: string;
  workflow: ReturnType<DeliveryWorkflow["snapshot"]>;
};

function rootPath(): string {
  return path.resolve(process.cwd(), "../..");
}

async function readExisting(file: string): Promise<StoredWorkflowRun | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as StoredWorkflowRun;
  } catch {
    return undefined;
  }
}

function appendUnique<T extends { id: string }>(items: T[], additions: T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of additions) byId.set(item.id, item);
  return [...byId.values()];
}

/**
 * Runs one idempotent, evidence-linked PM→TPM→engineering→eval workflow.
 * It deliberately stops at the release approval boundary: no external write
 * or deployment is performed by this action.
 */
export async function POST() {
  const root = rootPath();
  const artifactPath = path.resolve(root, "artifacts", WORKFLOW_ARTIFACT);
  const existing = await readExisting(artifactPath);
  if (existing?.key === RUN_KEY) {
    return NextResponse.json({ ok: true, reused: true, workflow: { ...existing, reused: true } });
  }

  try {
    const evidence = (JSON.parse(await readFile(path.resolve(root, "company/generated/research/evidence.json"), "utf8")) as unknown[])
      .map((item) => evidenceSchema.parse(item));
    const pm = analyzeProductEvidence(evidence, {
      runId: "RUN-0100",
      now,
      maxOpportunities: 3,
      sourceMode: "simulated"
    });
    const recommended = { ...pm.opportunities[0]!, status: "approved" as const, sourceMode: "simulated" as const };
    const plan = createTpmPlan(recommended, { runId: "RUN-0101", now, ticketStartOrdinal: 101 });
    const workstreams = await executeIndependentEngineeringWorkstreams(recommended, plan.tickets, { runStartOrdinal: 102 });
    const recovery = await runCriticalFailureRecoveryDemo();
    const failedCampaign = { ...recovery.failed.campaign, featureId: recommended.id, sourceMode: "simulated" as const };
    const passedCampaign = { ...recovery.corrected.campaign, featureId: recommended.id, sourceMode: "simulated" as const };

    const evalRuns = [
      agentRunSchema.parse({
        id: "RUN-0104", agent: "eval", status: "failed", startedAt: now, finishedAt: now,
        featureId: recommended.id, ticketIds: plan.tickets.slice(0, 2).map((ticket) => ticket.id), traceId: "trace-run-0104",
        costUsd: 0, latencyMs: 12, retries: 0,
        steps: [{ name: "critical-regression", status: "failed", durationMs: 12, detail: `Blocked by ${failedCampaign.results.find((result) => !result.passed)?.caseId ?? "critical case"}` }],
        sourceMode: "simulated"
      }),
      agentRunSchema.parse({
        id: "RUN-0105", agent: "eval", status: "succeeded", startedAt: now, finishedAt: now,
        featureId: recommended.id, ticketIds: plan.tickets.slice(0, 2).map((ticket) => ticket.id), traceId: "trace-run-0105",
        costUsd: 0, latencyMs: 12, retries: 0,
        steps: [{ name: "corrected-regression", status: "succeeded", durationMs: 12, detail: `Passed ${passedCampaign.weightedScore}/100 after correction` }],
        sourceMode: "simulated"
      })
    ];

    const workflow = DeliveryWorkflow.start({ id: "PROJ-0101", featureId: recommended.id, actor: "pm-agent", sourceMode: "simulated" }, () => now);
    workflow.requestFeatureApproval("APR-0101", "pm-agent");
    workflow.resumeWithHumanDecision({ approvalId: "APR-0101", status: "approved", reviewer: "product-council", rationale: "Evidence-backed scope approved for delivery.", decisionId: "DEC-0101", resolvedAt: now });
    workflow.completePlanning(plan.tickets.map((ticket) => ticket.id), "tpm-agent");
    workflow.completeDelivery(workstreams.map((record) => record.run.id), "engineering-agent");
    workflow.recordEvalGate({ campaignId: failedCampaign.id, releaseAllowed: false, reason: "Critical regression reproduced; release blocked.", actor: "eval-agent" });
    workflow.rerunAfterCorrection("engineering-agent", "Correction completed; rerun the blocked campaign.");
    workflow.recordEvalGate({ campaignId: passedCampaign.id, releaseAllowed: true, reason: "Corrected campaign passed; human release approval required.", actor: "eval-agent", releaseApprovalId: "APR-0102" });
    const workflowSnapshot = workflow.snapshot();

    const data = await loadDemoState();
    const decision = decisionSchema.parse({ id: "DEC-0101", featureId: recommended.id, outcome: "approved", rationale: "Evidence-backed scope approved for delivery.", reviewer: "product-council", decidedAt: now, sourceMode: "simulated" });
    const next: DemoState = {
      ...data,
      generatedAt: now,
      sourceMode: "simulated",
      features: appendUnique(data.features.filter((feature) => feature.id !== recommended.id), [recommended]),
      decisions: appendUnique(data.decisions, [decision]),
      tickets: appendUnique(data.tickets.filter((ticket) => !plan.tickets.some((nextTicket) => nextTicket.id === ticket.id)), plan.tickets),
      approvals: appendUnique(data.approvals.filter((approval) => !["APR-0101", "APR-0102"].includes(approval.id)), [
        { id: "APR-0101", featureId: recommended.id, stage: "feature", status: "approved", requestedAt: now, resolvedAt: now, reviewer: "product-council", rationale: "Evidence-backed scope approved for delivery.", sourceMode: "simulated" },
        { id: "APR-0102", featureId: recommended.id, stage: "release", status: "pending", requestedAt: now, sourceMode: "simulated" }
      ]),
      runs: appendUnique(data.runs.filter((run) => !["RUN-0100", "RUN-0101", "RUN-0102", "RUN-0103", "RUN-0104", "RUN-0105"].includes(run.id)), [pm.run, plan.run, ...workstreams.map((record) => record.run), ...evalRuns]),
      campaigns: appendUnique(data.campaigns.filter((campaign) => ![failedCampaign.id, passedCampaign.id].includes(campaign.id)), [
        { ...failedCampaign, runId: "RUN-0104" },
        { ...passedCampaign, runId: "RUN-0105" }
      ]),
      lineage: appendUnique(data.lineage, createPlanningAndDeliveryLineage({ evidenceIds: recommended.evidenceIds, featureId: recommended.id, decisionId: decision.id, prdId: plan.prd.id, tickets: plan.tickets, workstreams, createdAt: now })),
      activity: [
        { at: now, type: "workflow", title: "Workflow paused for release approval", detail: `${recommended.title} passed corrected evals and is waiting for a human release decision.`, entityId: "APR-0102" },
        { at: now, type: "eval", title: "Corrected campaign passed", detail: `${passedCampaign.id} scored ${passedCampaign.weightedScore} / 100 after the blocked run was corrected.`, entityId: passedCampaign.id },
        { at: now, type: "workflow", title: "Critical eval blocked release", detail: `${failedCampaign.id} blocked release until the correction was rerun.`, entityId: failedCampaign.id },
        ...data.activity
      ]
    };
    const validated = assertDemoState(next);
    const stored: StoredWorkflowRun = {
      key: RUN_KEY,
      createdAt: now,
      phase: workflowSnapshot.phase,
      sourceMode: "simulated",
      featureId: recommended.id,
      featureTitle: recommended.title,
      ticketIds: plan.tickets.map((ticket) => ticket.id),
      engineeringRunIds: workstreams.map((record) => record.run.id),
      blockedCampaignId: failedCampaign.id,
      passedCampaignId: passedCampaign.id,
      releaseApprovalId: "APR-0102",
      workflow: workflowSnapshot
    };
    await mkdir(path.resolve(root, "artifacts"), { recursive: true });
    await writeFile(path.resolve(root, "artifacts/demo-state.json"), `${JSON.stringify(validated, null, 2)}\n`);
    await writeFile(artifactPath, `${JSON.stringify(stored, null, 2)}\n`);
    return NextResponse.json({ ok: true, reused: false, workflow: stored });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Workflow execution failed.";
    return NextResponse.json({ ok: false, message: "Workflow execution failed before release approval.", detail }, { status: 500 });
  }
}
