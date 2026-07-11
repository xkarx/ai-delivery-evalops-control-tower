import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeProductEvidence, createPlanningAndDeliveryLineage, createTpmPlan, executeIndependentEngineeringWorkstreams, loadCompanyContextPack, runEngineeringFeasibilityReview, runLiveAgentReasoning, runUxReview } from "@dailycart/agents";
import { ConnectorError, createConnectorSuite, postAgentHandoffThread, type AgentHandoffThreadResult } from "@dailycart/connectors";
import { runCriticalFailureRecoveryDemo } from "@dailycart/evals";
import { DeliveryWorkflow } from "@dailycart/workflow";
import { agentRunSchema, assertDemoState, decisionSchema, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { buildWorkflowHandoffs, persistHandoffThread } from "@/lib/workflow-handoffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUN_KEY = "v1-cohesive-multi-agent";
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
  evidenceIds?: string[];
  workflow: ReturnType<DeliveryWorkflow["snapshot"]>;
  handoffThread?: AgentHandoffThreadResult;
  agentReasoning?: Record<string, { model: string; summary: string; sourceMode: string }>;
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
 * Runs one idempotent, evidence-linked PM→UX→feasibility→TPM→engineering→eval workflow.
 * It deliberately stops at the release approval boundary: no deployment is
 * performed, while the normalized agent handoff thread is emitted through the
 * configured Slack adapter.
 */
export async function POST(request: Request) {
  const root = rootPath();
  const artifactPath = path.resolve(root, "artifacts", WORKFLOW_ARTIFACT);
  const existing = await readExisting(artifactPath);
  const featureApproved = request.headers.get("x-dailycart-feature-approved") === "true";
  if (existing?.key === RUN_KEY && !(featureApproved && existing.phase === "awaiting_feature_approval")) {
    if (!existing.handoffThread) {
      try {
        const handoffThread = await postAgentHandoffThread(
          createConnectorSuite({ env: process.env }).chat,
          buildWorkflowHandoffs({ ...existing, workflowId: existing.workflow.id, evidenceIds: existing.evidenceIds }),
          { title: `DailyCart workflow ${existing.workflow.id}` }
        );
        await persistHandoffThread(root, handoffThread);
        existing.handoffThread = handoffThread;
        await writeFile(artifactPath, `${JSON.stringify(existing, null, 2)}\n`);
      } catch (error) {
        const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Agent handoff notification failed.";
        return NextResponse.json({ ok: true, partial: true, reused: true, workflow: { ...existing, reused: true }, handoffError: detail });
      }
    }
    return NextResponse.json({ ok: true, reused: true, workflow: { ...existing, reused: true } });
  }

  try {
    const contextPack = await loadCompanyContextPack(root, { expectedVersion: "1.0.0" });
    const evidence = contextPack.evidence;
    const pm = analyzeProductEvidence(evidence, {
      runId: "RUN-0100",
      now,
      maxOpportunities: 3,
      sourceMode: "simulated"
    });
    const uxReview = runUxReview(pm.opportunities[0]!, pm.implementationBrief, { now, sourceMode: "simulated" });
    const feasibilityReview = runEngineeringFeasibilityReview(pm.opportunities[0]!, pm.implementationBrief, { now, sourceMode: "simulated" });
    const reasoningResults = await Promise.all([
      ["pm", { role: "PM agent", task: "Explain the selected opportunity and why it is ranked first.", context: { feature: pm.opportunities[0], evidenceIds: pm.opportunities[0]?.evidenceIds } }],
      ["ux", { role: "UX agent", task: "Summarize the journey and accessibility review.", context: uxReview }],
      ["engineering-feasibility", { role: "Engineering feasibility agent", task: "Summarize affected surfaces, risks, and preview requirements.", context: feasibilityReview }]
    ].map(async ([key, input]) => [key, await runLiveAgentReasoning(input as { role: string; task: string; context: unknown })] as const));
    const agentReasoning = Object.fromEntries(reasoningResults);
    if (!featureApproved) {
      const pendingWorkflow = DeliveryWorkflow.start({ id: "PROJ-0101", featureId: pm.opportunities[0]!.id, actor: "pm-agent", sourceMode: "simulated" }, () => now);
      pendingWorkflow.requestFeatureApproval("APR-0101", "pm-agent");
      const pending = {
        key: RUN_KEY, createdAt: now, phase: pendingWorkflow.snapshot().phase, sourceMode: "simulated" as const,
        featureId: pm.opportunities[0]!.id, featureTitle: pm.opportunities[0]!.title, evidenceIds: pm.opportunities[0]!.evidenceIds,
        ticketIds: [], engineeringRunIds: [], blockedCampaignId: "", passedCampaignId: "", releaseApprovalId: "APR-0101",
        workflow: pendingWorkflow.snapshot(), agentReasoning
      } satisfies StoredWorkflowRun;
      await mkdir(path.resolve(root, "artifacts"), { recursive: true });
      try {
        const preApprovalHandoffs = buildWorkflowHandoffs({
          ...pending,
          workflowId: pending.workflow.id,
          evidenceIds: pending.evidenceIds
        }).slice(0, 3);
        const handoffThread = await postAgentHandoffThread(
          createConnectorSuite({ env: process.env }).chat,
          preApprovalHandoffs,
          { title: `DailyCart workflow ${pending.workflow.id}` }
        );
        (pending as StoredWorkflowRun).handoffThread = handoffThread;
        await persistHandoffThread(root, handoffThread);
      } catch {
        // Approval remains usable when Slack is unavailable; the UI labels the fallback.
      }
      await writeFile(artifactPath, `${JSON.stringify(pending, null, 2)}\n`);
      await writeFile(path.resolve(root, "artifacts/workflow-reviews.json"), `${JSON.stringify({ featureId: pm.opportunities[0]!.id, implementationBrief: pm.implementationBrief, uxReview, feasibilityReview, agentReasoning }, null, 2)}\n`);
      return NextResponse.json({ ok: true, featureApprovalRequired: true, workflow: { ...pending, recommendation: pm.opportunities[0], uxReview, feasibilityReview, implementationBrief: pm.implementationBrief } });
    }
    const recommended = { ...pm.opportunities[0]!, status: "approved" as const, sourceMode: "simulated" as const };
    const plan = createTpmPlan(recommended, { implementationBrief: pm.implementationBrief, runId: "RUN-0101", now, ticketStartOrdinal: 101 });
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
      runs: appendUnique(data.runs.filter((run) => !["RUN-0100", "RUN-0110", "RUN-0111", "RUN-0101", "RUN-0102", "RUN-0103", "RUN-0104", "RUN-0105"].includes(run.id)), [pm.run, uxReview.run, feasibilityReview.run, plan.run, ...workstreams.map((record) => record.run), ...evalRuns]),
      campaigns: appendUnique(data.campaigns.filter((campaign) => ![failedCampaign.id, passedCampaign.id].includes(campaign.id)), [
        { ...failedCampaign, runId: "RUN-0104" },
        { ...passedCampaign, runId: "RUN-0105" }
      ]),
      lineage: appendUnique(data.lineage, createPlanningAndDeliveryLineage({ evidenceIds: recommended.evidenceIds, featureId: recommended.id, decisionId: decision.id, prdId: plan.implementationBrief.id, tickets: plan.tickets, workstreams, createdAt: now })),
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
      evidenceIds: recommended.evidenceIds,
      workflow: workflowSnapshot,
      agentReasoning
    };
    await mkdir(path.resolve(root, "artifacts"), { recursive: true });
    await writeFile(path.resolve(root, "artifacts/demo-state.json"), `${JSON.stringify(validated, null, 2)}\n`);
    await writeFile(path.resolve(root, "artifacts/workflow-reviews.json"), `${JSON.stringify({ featureId: recommended.id, implementationBrief: pm.implementationBrief, uxReview, feasibilityReview }, null, 2)}\n`);
    await writeFile(artifactPath, `${JSON.stringify(stored, null, 2)}\n`);
    try {
      const allHandoffs = buildWorkflowHandoffs({ ...stored, workflowId: stored.workflow.id, evidenceIds: recommended.evidenceIds });
      const handoffThread = await postAgentHandoffThread(
        createConnectorSuite({ env: process.env }).chat,
        existing?.handoffThread ? allHandoffs.slice(3) : allHandoffs,
        { title: `DailyCart workflow ${stored.workflow.id}`, threadId: existing?.handoffThread?.threadId }
      );
      if (existing?.handoffThread) {
        stored.handoffThread = {
          ...existing.handoffThread,
          messages: [...existing.handoffThread.messages, ...handoffThread.messages],
          threadId: handoffThread.threadId
        };
      }
      await persistHandoffThread(root, handoffThread);
      stored.handoffThread ??= handoffThread;
      await writeFile(artifactPath, `${JSON.stringify(stored, null, 2)}\n`);
      return NextResponse.json({ ok: true, reused: false, workflow: stored });
    } catch (error) {
      const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Agent handoff notification failed.";
      return NextResponse.json({ ok: true, partial: true, reused: false, workflow: stored, handoffError: detail });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Workflow execution failed.";
    return NextResponse.json({ ok: false, message: "Workflow execution failed before release approval.", detail }, { status: 500 });
  }
}
