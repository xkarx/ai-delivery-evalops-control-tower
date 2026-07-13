import path from "node:path";
import { createHash } from "node:crypto";
import { analyzeProductEvidence, annotateAgentRun, createImplementationBrief, createPlanningAndDeliveryLineage, createTpmPlan, executeIndependentEngineeringWorkstreams, loadCompanyContextPack, runEngineeringFeasibilityReview, runLiveAgentReasoning, runUxReview } from "@dailycart/agents";
import { ConnectorError, createConnectorSuite, postAgentHandoffFanout, postAgentHandoffThread, type AgentHandoffFanoutResult, type AgentHandoffThreadResult } from "@dailycart/connectors";
import { createSemanticJudge, EvidenceGroundingGrader, RequiredFieldsGrader, runCriticalFailureRecoveryDemo } from "@dailycart/evals";
import { DeliveryWorkflow } from "@dailycart/workflow";
import { agentRunSchema, assertDemoState, decisionSchema, evalCaseSchema, type AgentRun, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { buildWorkflowHandoffs, persistHandoffThread } from "@/lib/workflow-handoffs";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { persistStructuredRecord, readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUN_KEY = "v1-cohesive-multi-agent";
type AgentOutputEval = { id: string; runId: string; skillId: string; criterion: string; grader: string; score: number; passed: boolean; rationale: string; mode: "deterministic" | "live-judge" | "mocked-judge"; evaluatedAt: string };

async function evaluateAgentOutput(input: { run: AgentRun; actual: Record<string, unknown>; allowedEvidenceIds: string[]; requiredFields: string[]; semanticCriteria: string[]; ordinal: number; now: string }): Promise<AgentOutputEval[]> {
  const groundingCase = evalCaseSchema.parse({ id: `EVALCASE-${9100 + input.ordinal}`, datasetVersion: "dailycart-agent-outputs@1", category: "grounding", input: { runId: input.run.id }, expected: { allowedEvidenceIds: input.allowedEvidenceIds, minimumCitations: 1 }, critical: true, sourceMode: "synthetic" });
  const fieldsCase = evalCaseSchema.parse({ id: `EVALCASE-${9200 + input.ordinal}`, datasetVersion: "dailycart-agent-outputs@1", category: "requirements", input: { runId: input.run.id }, expected: { requiredFields: input.requiredFields }, critical: true, sourceMode: "synthetic" });
  const semanticCase = evalCaseSchema.parse({ id: `EVALCASE-${9300 + input.ordinal}`, datasetVersion: "dailycart-agent-outputs@1", category: "requirements", input: { runId: input.run.id, task: "Evaluate the agent output against the stated criteria." }, expected: { minimumScore: 75, criteria: input.semanticCriteria, reference: input.semanticCriteria.join(" ") }, critical: true, sourceMode: "synthetic" });
  const grounding = new EvidenceGroundingGrader().grade(groundingCase, { evidenceIds: input.run.citedEvidenceIds ?? [] });
  const fields = new RequiredFieldsGrader().grade(fieldsCase, input.actual);
  const judge = createSemanticJudge(process.env);
  const semantic = await judge.judge({ evalCase: semanticCase, actual: input.actual });
  return [
    { id: `AEVAL-${input.ordinal}-GROUNDING`, runId: input.run.id, skillId: input.run.skillId ?? "unknown", criterion: "Evidence citation validity", grader: "deterministic:evidence-grounding", ...grounding, mode: "deterministic", evaluatedAt: input.now },
    { id: `AEVAL-${input.ordinal}-STRUCTURE`, runId: input.run.id, skillId: input.run.skillId ?? "unknown", criterion: "Structured output contract", grader: "deterministic:required-fields", ...fields, mode: "deterministic", evaluatedAt: input.now },
    { id: `AEVAL-${input.ordinal}-SEMANTIC`, runId: input.run.id, skillId: input.run.skillId ?? "unknown", criterion: input.semanticCriteria.join("; "), grader: judge.label, score: semantic.score, passed: semantic.passed, rationale: semantic.rationale, mode: judge.mode === "live" ? "live-judge" : "mocked-judge", evaluatedAt: input.now }
  ];
}

function slackChannelMap(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return { delivery: env.SLACK_DELIVERY_CHANNEL, approvals: env.SLACK_APPROVALS_CHANNEL, alerts: env.SLACK_ALERTS_CHANNEL, analytics: env.SLACK_ANALYTICS_CHANNEL };
}

type StoredWorkflowRun = {
  key: string;
  sessionId?: string;
  workflowInstanceId?: string;
  activeActionId?: string;
  createdAt: string;
  reused?: boolean;
  phase: string;
  sourceMode: "simulated" | "live";
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
  handoffFanout?: AgentHandoffFanoutResult;
  agentReasoning?: Record<string, { model: string; summary: string; sourceMode: string }>;
  agentEvals?: AgentOutputEval[];
  featureBatchId?: string;
  recommendations?: Array<{ id: string; title: string; score: number; confidence: number; evidenceIds: string[]; problem: string; hypothesis: string; status: string; workstream: string; metrics: string[]; sourceMode: string }>;
  featureTracks?: Array<{ featureId: string; featureTitle: string; prdId: string; ticketIds: string[]; engineeringRunIds: string[]; blockedCampaignId: string; passedCampaignId: string; featureApprovalId: string; releaseApprovalId: string; status: string }>;
};

function rootPath(): string {
  return path.resolve(process.cwd(), "../..");
}

function sessionIdentifiers(sessionId: string) {
  const base = 10_000_000 + (Number.parseInt(createHash("sha256").update(sessionId).digest("hex").slice(0, 8), 16) % 80_000_000);
  const id = (prefix: string, offset: number) => `${prefix}-${base + offset}`;
  return {
    batch: id("BATCH", 1), project: id("PROJ", 2),
    pm: id("RUN", 10), ux: id("RUN", 11), feasibility: id("RUN", 12), plan: id("RUN", 13),
    engineeringStart: base + 20, evalBlockedRun: id("RUN", 30), evalPassedRun: id("RUN", 31),
    secondaryUx: id("RUN", 40), secondaryFeasibility: id("RUN", 41), secondaryPlan: id("RUN", 42),
    secondaryEngineeringStart: base + 50, secondaryEvalBlockedRun: id("RUN", 60), secondaryEvalPassedRun: id("RUN", 61),
    featureApproval: id("APR", 70), releaseApproval: id("APR", 71), secondaryFeatureApproval: id("APR", 72), secondaryReleaseApproval: id("APR", 73),
    decision: id("DEC", 80), secondaryDecision: id("DEC", 81), blockedCampaign: id("EVAL", 90), passedCampaign: id("EVAL", 91), secondaryBlockedCampaign: id("EVAL", 92), secondaryPassedCampaign: id("EVAL", 93),
    primaryTicketStart: base + 100, secondaryTicketStart: base + 200
  };
}

function appendUnique<T extends { id: string }>(items: T[], additions: T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of additions) byId.set(item.id, item);
  return [...byId.values()];
}

async function persistAgentRecords(sessionId: string, feature: { id: string; title: string }, runs: AgentRun[], evaluations: AgentOutputEval[]): Promise<void> {
  await persistStructuredRecord("features", feature.id, { sessionId, title: feature.title, agentRunIds: runs.map((run) => run.id), sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "mocked" }, sessionId);
  for (const run of runs) await persistStructuredRecord("workflow_runs", run.id, { sessionId, workflowType: `agent:${run.agent}`, status: run.status, featureId: feature.id, skillId: run.skillId, skillVersion: run.skillVersion, contextPackId: run.contextPackId, evidenceIds: run.citedEvidenceIds, toolCalls: run.toolCalls, steps: run.steps, reasoningSummary: run.reasoningSummary, traceId: run.traceId, latencyMs: run.latencyMs, costUsd: run.costUsd, sourceMode: run.sourceMode }, sessionId);
  for (const evaluation of evaluations) await persistStructuredRecord("eval_results", evaluation.id, { ...evaluation, sessionId }, sessionId);
}

/**
 * Runs one idempotent, evidence-linked PM→UX→feasibility→TPM→engineering→eval workflow.
 * It deliberately stops at the release approval boundary: no deployment is
 * performed, while the normalized agent handoff thread is emitted through the
 * configured Slack adapter.
 */
export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = rootPath();
  const now = new Date().toISOString();
  const sessionId = request.headers.get("x-dailycart-session-id") || `SESSION-${Date.now()}`;
  const workflowInstanceId = request.headers.get("x-dailycart-workflow-id") || `WORKFLOW-${Date.now()}`;
  const activeActionId = request.headers.get("x-dailycart-action-id") || undefined;
  const ids = sessionIdentifiers(sessionId);
  const runKey = `${RUN_KEY}:${sessionId}`;
  const executionSourceMode = process.env.INTEGRATION_MODE === "live" ? "live" as const : "simulated" as const;
  const existing = await readArtifact<StoredWorkflowRun>("workflow", sessionId);
  const featureApproved = request.headers.get("x-dailycart-feature-approved") === "true";
  // The command route writes a minimal session binding before execution. That
  // binding proves identity but does not mean the agent workflow has run.
  const hasExecutedWorkflow = Boolean(existing?.featureId && existing?.phase && existing?.workflow?.id);
  if (existing && hasExecutedWorkflow && (existing.sessionId === sessionId || (!existing.sessionId && existing.phase === "awaiting_feature_approval")) && !(featureApproved && existing.phase === "awaiting_feature_approval")) {
    if (!existing.handoffThread) {
      try {
        const handoffThread = await postAgentHandoffThread(
          createConnectorSuite({ env: process.env }).chat,
          buildWorkflowHandoffs({ ...existing, workflowId: existing.workflow.id, evidenceIds: existing.evidenceIds }),
          { title: `DailyCart workflow ${existing.workflow.id}` }
        );
        await persistHandoffThread(root, handoffThread);
        existing.handoffThread = handoffThread;
        await writeArtifact("workflow", existing, sessionId);
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
    const featureBatchId = ids.batch;
    const pmRaw = analyzeProductEvidence(evidence, {
      runId: ids.pm,
      now,
      maxOpportunities: 3,
      sourceMode: "simulated"
    });
    const selected = pmRaw.opportunities[0]!;
    const pmReasoning = await runLiveAgentReasoning({ role: "PM agent", task: "Explain the selected opportunity and why it is ranked first.", context: { feature: selected, evidenceIds: selected.evidenceIds } });
    const pm = { ...pmRaw, run: annotateAgentRun(pmRaw.run, { skillId: "feature-prioritization", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: pmRaw.evidenceIds, reasoningSummary: pmReasoning.summary }) };
    const uxRaw = runUxReview(selected, pm.implementationBrief, { now, sourceMode: "simulated", runId: ids.ux });
    const uxReview = { ...uxRaw, run: annotateAgentRun(uxRaw.run, { skillId: "ux-review", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: selected.evidenceIds }) };
    const feasibilityRaw = runEngineeringFeasibilityReview(selected, pm.implementationBrief, { now, sourceMode: "simulated", runId: ids.feasibility });
    const feasibilityReview = { ...feasibilityRaw, run: annotateAgentRun(feasibilityRaw.run, { skillId: "engineering-feasibility-review", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: selected.evidenceIds }) };
    const reasoningResults = await Promise.all([
      ["pm", { role: "PM agent", task: "Explain the selected opportunity and why it is ranked first.", context: { feature: selected, evidenceIds: selected.evidenceIds } }],
      ["ux", { role: "UX agent", task: "Summarize the journey and accessibility review.", context: uxReview }],
      ["engineering-feasibility", { role: "Engineering feasibility agent", task: "Summarize affected surfaces, risks, and preview requirements.", context: feasibilityReview }]
    ].map(async ([key, input]) => [key, await runLiveAgentReasoning(input as { role: string; task: string; context: unknown })] as const));
    const agentReasoning = Object.fromEntries(reasoningResults);
    const agentEvals = (await Promise.all([
      evaluateAgentOutput({ run: pm.run, actual: { featureId: selected.id, evidenceIds: selected.evidenceIds, implementationBrief: pm.implementationBrief, rankingScore: selected.score }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "implementationBrief", "rankingScore"], semanticCriteria: ["opportunity ranking is evidence grounded", "problem and outcome are explicit", "acceptance criteria are measurable"], ordinal: 1, now }),
      evaluateAgentOutput({ run: uxReview.run, actual: { featureId: selected.id, evidenceIds: selected.evidenceIds, findings: uxReview.findings, reviewType: uxReview.reviewType }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "findings", "reviewType"], semanticCriteria: ["keyboard behavior covered", "focus restoration covered", "accessibility risks are actionable"], ordinal: 2, now }),
      evaluateAgentOutput({ run: feasibilityReview.run, actual: { featureId: selected.id, evidenceIds: selected.evidenceIds, findings: feasibilityReview.findings, reviewType: feasibilityReview.reviewType }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "findings", "reviewType"], semanticCriteria: ["affected surfaces identified", "telemetry requirements covered", "preview and delivery risks bounded"], ordinal: 3, now })
    ])).flat();
    const blockingAgentEvals = agentEvals.filter((evaluation) => !evaluation.passed && evaluation.mode !== "mocked-judge");
    if (blockingAgentEvals.length) {
      await writeArtifact("workflowReviews", { sessionId, featureId: selected.id, featureBatchId, implementationBrief: pm.implementationBrief, uxReview, feasibilityReview, agentReasoning, agentEvals, blocked: true }, sessionId);
      return NextResponse.json({ ok: false, message: "Agent output evaluation blocked feature approval.", detail: blockingAgentEvals.map((evaluation) => `${evaluation.criterion}: ${evaluation.rationale}`).join("; "), agentEvals }, { status: 422 });
    }
    await persistAgentRecords(sessionId, selected, [pm.run, uxReview.run, feasibilityReview.run], agentEvals);
    if (!featureApproved) {
      const pendingWorkflow = DeliveryWorkflow.start({ id: ids.project, featureId: selected.id, actor: "pm-agent", sourceMode: "simulated" }, () => now);
      pendingWorkflow.requestFeatureApproval(ids.featureApproval, "pm-agent");
      const pending = {
        key: runKey, sessionId, workflowInstanceId, activeActionId, createdAt: now, phase: pendingWorkflow.snapshot().phase, sourceMode: executionSourceMode,
        featureId: selected.id, featureTitle: selected.title, evidenceIds: selected.evidenceIds,
        ticketIds: [], engineeringRunIds: [], blockedCampaignId: "", passedCampaignId: "", releaseApprovalId: ids.featureApproval,
        workflow: pendingWorkflow.snapshot(), agentReasoning, agentEvals, featureBatchId, recommendations: pmRaw.opportunities.slice(0, 2)
      } satisfies StoredWorkflowRun;
      try {
        const preApprovalHandoffs = buildWorkflowHandoffs({
          ...pending,
          workflowId: pending.workflow.id,
          evidenceIds: pending.evidenceIds
        }).slice(0, 3);
        const chat = createConnectorSuite({ env: process.env }).chat;
        const handoffThread = await postAgentHandoffThread(
          chat,
          preApprovalHandoffs,
          { title: `DailyCart workflow ${pending.workflow.id}` }
        );
        (pending as StoredWorkflowRun).handoffFanout = await postAgentHandoffFanout(chat, preApprovalHandoffs, slackChannelMap(process.env), `DailyCart workflow ${pending.workflow.id}`);
        (pending as StoredWorkflowRun).handoffThread = handoffThread;
        await persistHandoffThread(root, handoffThread);
      } catch {
        // Approval remains usable when Slack is unavailable; the UI labels the fallback.
      }
      await writeArtifact("workflow", pending, sessionId);
      await writeArtifact("workflowReviews", { sessionId, featureId: selected.id, featureBatchId, recommendations: pmRaw.opportunities.slice(0, 2), implementationBrief: pm.implementationBrief, uxReview, feasibilityReview, agentReasoning, agentEvals }, sessionId);
      return NextResponse.json({ ok: true, featureApprovalRequired: true, workflow: { ...pending, recommendation: selected, recommendations: pmRaw.opportunities.slice(0, 2), uxReview, feasibilityReview, implementationBrief: pm.implementationBrief, featureBatchId } });
    }
    const recommended = { ...selected, status: "approved" as const, sourceMode: "simulated" as const };
    const planRaw = createTpmPlan(recommended, { implementationBrief: pm.implementationBrief, runId: ids.plan, now, ticketStartOrdinal: ids.primaryTicketStart });
    const plan = { ...planRaw, run: annotateAgentRun(planRaw.run, { skillId: "implementation-planning", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: recommended.evidenceIds }) };
    const planningAgentEvals = await evaluateAgentOutput({ run: plan.run, actual: { featureId: recommended.id, evidenceIds: recommended.evidenceIds, tickets: plan.tickets, implementationBriefId: plan.implementationBrief.id }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "tickets", "implementationBriefId"], semanticCriteria: ["workstreams and ownership are clear", "dependencies and milestones are actionable", "readiness risks are explicit"], ordinal: 4, now });
    const planningBlockers = planningAgentEvals.filter((evaluation) => !evaluation.passed && evaluation.mode !== "mocked-judge");
    if (planningBlockers.length) { await writeArtifact("workflowReviews", { sessionId, featureId: recommended.id, featureBatchId, agentReasoning, agentEvals: [...agentEvals, ...planningAgentEvals], blocked: true }, sessionId); return NextResponse.json({ ok: false, message: "Delivery planning evaluation blocked implementation.", detail: planningBlockers.map((evaluation) => evaluation.rationale).join("; ") }, { status: 422 }); }
    const allAgentEvals = [...agentEvals, ...planningAgentEvals];
    const workstreamRaw = await executeIndependentEngineeringWorkstreams(recommended, plan.tickets, { runStartOrdinal: ids.engineeringStart });
    const workstreams = workstreamRaw.map((record) => ({ ...record, run: annotateAgentRun(record.run, { skillId: "code-implementation", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: recommended.evidenceIds }) }));
    const recovery = await runCriticalFailureRecoveryDemo();
    const failedCampaign = { ...recovery.failed.campaign, id: ids.blockedCampaign, runId: ids.evalBlockedRun, featureId: recommended.id, sourceMode: "simulated" as const };
    const passedCampaign = { ...recovery.corrected.campaign, id: ids.passedCampaign, runId: ids.evalPassedRun, featureId: recommended.id, sourceMode: "simulated" as const };

    const evalRuns = [
      agentRunSchema.parse({
        id: ids.evalBlockedRun, agent: "eval", status: "failed", startedAt: now, finishedAt: now,
        featureId: recommended.id, ticketIds: plan.tickets.slice(0, 2).map((ticket) => ticket.id), traceId: `trace-${ids.evalBlockedRun.toLowerCase()}`,
        costUsd: 0, latencyMs: 12, retries: 0,
        steps: [{ name: "critical-regression", status: "failed", durationMs: 12, detail: `Blocked by ${failedCampaign.results.find((result) => !result.passed)?.caseId ?? "critical case"}` }],
        sourceMode: "simulated", skillId: "release-readiness", skillVersion: "1.0.0", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: recommended.evidenceIds
      }),
      agentRunSchema.parse({
        id: ids.evalPassedRun, agent: "eval", status: "succeeded", startedAt: now, finishedAt: now,
        featureId: recommended.id, ticketIds: plan.tickets.slice(0, 2).map((ticket) => ticket.id), traceId: `trace-${ids.evalPassedRun.toLowerCase()}`,
        costUsd: 0, latencyMs: 12, retries: 0,
        steps: [{ name: "corrected-regression", status: "succeeded", durationMs: 12, detail: `Passed ${passedCampaign.weightedScore}/100 after correction` }],
        sourceMode: "simulated", skillId: "release-readiness", skillVersion: "1.0.0", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: recommended.evidenceIds
      })
    ];

    const secondaryCandidate = pmRaw.opportunities[1];
    const secondary = secondaryCandidate ? { ...secondaryCandidate, status: "approved" as const, sourceMode: "simulated" as const } : undefined;
    const secondaryBrief = secondary ? createImplementationBrief(secondary, { briefOrdinal: 2, now }) : undefined;
    const secondaryUx = secondary && secondaryBrief ? runUxReview(secondary, secondaryBrief, { now, sourceMode: "simulated", runId: ids.secondaryUx, reviewId: `EXT-${ids.secondaryEngineeringStart}` }) : undefined;
    const secondaryFeasibility = secondary && secondaryBrief ? runEngineeringFeasibilityReview(secondary, secondaryBrief, { now, sourceMode: "simulated", runId: ids.secondaryFeasibility, reviewId: `EXT-${ids.secondaryEngineeringStart + 1}` }) : undefined;
    const secondaryReasoning = secondary && secondaryUx && secondaryFeasibility ? await Promise.all([
      runLiveAgentReasoning({ role: "PM agent", task: "Explain the second ranked opportunity and its evidence.", context: { feature: secondary, evidenceIds: secondary.evidenceIds } }),
      runLiveAgentReasoning({ role: "UX agent", task: "Summarize the second feature's accessibility review.", context: secondaryUx }),
      runLiveAgentReasoning({ role: "Engineering feasibility agent", task: "Summarize the second feature's implementation risks and preview requirements.", context: secondaryFeasibility })
    ]) : [];
    const allAgentReasoning = { ...agentReasoning, ...(secondaryReasoning[0] ? { "pm-secondary": secondaryReasoning[0] } : {}), ...(secondaryReasoning[1] ? { "ux-secondary": secondaryReasoning[1] } : {}), ...(secondaryReasoning[2] ? { "engineering-feasibility-secondary": secondaryReasoning[2] } : {}) };
    const secondaryUxAnnotated = secondaryUx ? { ...secondaryUx, run: annotateAgentRun(secondaryUx.run, { skillId: "ux-review", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: secondary?.evidenceIds, reasoningSummary: secondaryReasoning[1]?.summary }) } : undefined;
    const secondaryFeasibilityAnnotated = secondaryFeasibility ? { ...secondaryFeasibility, run: annotateAgentRun(secondaryFeasibility.run, { skillId: "engineering-feasibility-review", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: secondary?.evidenceIds, reasoningSummary: secondaryReasoning[2]?.summary }) } : undefined;
    const secondaryPlanRaw = secondary && secondaryBrief ? createTpmPlan(secondary, { implementationBrief: secondaryBrief, runId: ids.secondaryPlan, now, ticketStartOrdinal: ids.secondaryTicketStart }) : undefined;
    const secondaryPlan = secondaryPlanRaw ? { ...secondaryPlanRaw, run: annotateAgentRun(secondaryPlanRaw.run, { skillId: "implementation-planning", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: secondary!.evidenceIds }) } : undefined;
    const secondaryWorkstreamRaw = secondary && secondaryPlan ? await executeIndependentEngineeringWorkstreams(secondary, secondaryPlan.tickets, { runStartOrdinal: ids.secondaryEngineeringStart }) : [];
    const secondaryWorkstreams = secondaryWorkstreamRaw.map((record) => ({ ...record, run: annotateAgentRun(record.run, { skillId: "code-implementation", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: secondary?.evidenceIds }) }));
    const secondaryRecovery = secondary ? await runCriticalFailureRecoveryDemo() : undefined;
    const secondaryFailedCampaign = secondaryRecovery && secondary ? { ...secondaryRecovery.failed.campaign, id: ids.secondaryBlockedCampaign, featureId: secondary.id, runId: ids.secondaryEvalBlockedRun, sourceMode: "simulated" as const } : undefined;
    const secondaryPassedCampaign = secondaryRecovery && secondary ? { ...secondaryRecovery.corrected.campaign, id: ids.secondaryPassedCampaign, featureId: secondary.id, runId: ids.secondaryEvalPassedRun, sourceMode: "simulated" as const } : undefined;
    const secondaryEvalRuns = secondary && secondaryPlan && secondaryFailedCampaign && secondaryPassedCampaign ? [
      agentRunSchema.parse({ id: ids.secondaryEvalBlockedRun, agent: "eval", status: "failed", startedAt: now, finishedAt: now, featureId: secondary.id, ticketIds: secondaryPlan.tickets.slice(0, 2).map((ticket) => ticket.id), traceId: `trace-${ids.secondaryEvalBlockedRun.toLowerCase()}`, costUsd: 0, latencyMs: 12, retries: 0, steps: [{ name: "critical-regression", status: "failed", durationMs: 12, detail: `Blocked by ${secondaryFailedCampaign.results.find((result) => !result.passed)?.caseId ?? "critical case"}` }], sourceMode: "simulated", skillId: "release-readiness", skillVersion: "1.0.0", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: secondary.evidenceIds }),
      agentRunSchema.parse({ id: ids.secondaryEvalPassedRun, agent: "eval", status: "succeeded", startedAt: now, finishedAt: now, featureId: secondary.id, ticketIds: secondaryPlan.tickets.slice(0, 2).map((ticket) => ticket.id), traceId: `trace-${ids.secondaryEvalPassedRun.toLowerCase()}`, costUsd: 0, latencyMs: 12, retries: 0, steps: [{ name: "corrected-regression", status: "succeeded", durationMs: 12, detail: `Passed ${secondaryPassedCampaign.weightedScore}/100 after correction` }], sourceMode: "simulated", skillId: "release-readiness", skillVersion: "1.0.0", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: secondary.evidenceIds })
    ] : [];
    if (secondary && secondaryUxAnnotated && secondaryFeasibilityAnnotated && secondaryPlan) await persistAgentRecords(sessionId, secondary, [secondaryUxAnnotated.run, secondaryFeasibilityAnnotated.run, secondaryPlan.run, ...secondaryWorkstreams.map((record) => record.run), ...secondaryEvalRuns], []);

    const workflow = DeliveryWorkflow.start({ id: ids.project, featureId: recommended.id, actor: "pm-agent", sourceMode: "simulated" }, () => now);
    workflow.requestFeatureApproval(ids.featureApproval, "pm-agent");
    workflow.resumeWithHumanDecision({ approvalId: ids.featureApproval, status: "approved", reviewer: "product-council", rationale: "Evidence-backed scope approved for delivery.", decisionId: ids.decision, resolvedAt: now });
    workflow.completePlanning(plan.tickets.map((ticket) => ticket.id), "tpm-agent");
    workflow.completeDelivery(workstreams.map((record) => record.run.id), "engineering-agent");
    workflow.recordEvalGate({ campaignId: failedCampaign.id, releaseAllowed: false, reason: "Critical regression reproduced; release blocked.", actor: "eval-agent" });
    workflow.rerunAfterCorrection("engineering-agent", "Correction completed; rerun the blocked campaign.");
    workflow.recordEvalGate({ campaignId: passedCampaign.id, releaseAllowed: true, reason: "Corrected campaign passed; human release approval required.", actor: "eval-agent", releaseApprovalId: ids.releaseApproval });
    const workflowSnapshot = workflow.snapshot();

    const data = await loadDemoState(sessionId);
    const decision = decisionSchema.parse({ id: ids.decision, featureId: recommended.id, outcome: "approved", rationale: "Evidence-backed scope approved for delivery.", reviewer: "product-council", decidedAt: now, sourceMode: "simulated" });
    const next: DemoState = {
      ...data,
      generatedAt: now,
      sourceMode: executionSourceMode,
      features: appendUnique(data.features.filter((feature) => feature.id !== recommended.id && feature.id !== secondary?.id), [recommended, ...(secondary ? [secondary] : [])]),
      decisions: appendUnique(data.decisions, [decision, ...(secondary ? [decisionSchema.parse({ id: ids.secondaryDecision, featureId: secondary.id, outcome: "approved", rationale: "Second evidence-ranked feature track approved for parallel delivery.", reviewer: "product-council", decidedAt: now, sourceMode: "simulated" })] : [])]),
      tickets: appendUnique(data.tickets.filter((ticket) => ![...plan.tickets, ...(secondaryPlan?.tickets ?? [])].some((nextTicket) => nextTicket.id === ticket.id)), [...plan.tickets, ...(secondaryPlan?.tickets ?? [])]),
      approvals: appendUnique(data.approvals, [
        { id: ids.featureApproval, featureId: recommended.id, stage: "feature", status: "approved", requestedAt: now, resolvedAt: now, reviewer: "product-council", rationale: "Evidence-backed scope approved for delivery.", sourceMode: "simulated" },
        { id: ids.releaseApproval, featureId: recommended.id, stage: "release", status: "pending", requestedAt: now, sourceMode: "simulated" },
        ...(secondary ? [{ id: ids.secondaryFeatureApproval, featureId: secondary.id, stage: "feature" as const, status: "approved" as const, requestedAt: now, resolvedAt: now, reviewer: "product-council", rationale: "Second evidence-ranked feature track approved for parallel delivery.", sourceMode: "simulated" as const }, { id: ids.secondaryReleaseApproval, featureId: secondary.id, stage: "release" as const, status: "pending" as const, requestedAt: now, sourceMode: "simulated" as const }] : [])
      ]),
      runs: appendUnique(data.runs, [pm.run, uxReview.run, feasibilityReview.run, plan.run, ...workstreams.map((record) => record.run), ...evalRuns, ...(secondary && secondaryUxAnnotated && secondaryFeasibilityAnnotated && secondaryPlan ? [secondaryUxAnnotated.run, secondaryFeasibilityAnnotated.run, secondaryPlan.run, ...secondaryWorkstreams.map((record) => record.run), ...secondaryEvalRuns] : [])]),
      campaigns: appendUnique(data.campaigns.filter((campaign) => ![failedCampaign.id, passedCampaign.id, ...(secondaryFailedCampaign ? [secondaryFailedCampaign.id] : []), ...(secondaryPassedCampaign ? [secondaryPassedCampaign.id] : [])].includes(campaign.id)), [
        failedCampaign,
        passedCampaign,
        ...(secondaryFailedCampaign && secondaryPassedCampaign ? [{ ...secondaryFailedCampaign }, { ...secondaryPassedCampaign }] : [])
      ]),
      lineage: appendUnique(data.lineage, [...createPlanningAndDeliveryLineage({ evidenceIds: recommended.evidenceIds, featureId: recommended.id, decisionId: decision.id, prdId: plan.implementationBrief.id, tickets: plan.tickets, workstreams, createdAt: now }), ...(secondary && secondaryPlan && secondaryUxAnnotated && secondaryFeasibilityAnnotated ? createPlanningAndDeliveryLineage({ evidenceIds: secondary.evidenceIds, featureId: secondary.id, decisionId: ids.secondaryDecision, prdId: secondaryPlan.implementationBrief.id, tickets: secondaryPlan.tickets, workstreams: secondaryWorkstreams, createdAt: now }) : [])]),
      activity: [
        { at: now, type: "workflow", title: "Workflow paused for release approval", detail: `${recommended.title} passed corrected evals and is waiting for a human release decision.`, entityId: ids.releaseApproval },
        { at: now, type: "eval", title: "Corrected campaign passed", detail: `${passedCampaign.id} scored ${passedCampaign.weightedScore} / 100 after the blocked run was corrected.`, entityId: passedCampaign.id },
        { at: now, type: "workflow", title: "Critical eval blocked release", detail: `${failedCampaign.id} blocked release until the correction was rerun.`, entityId: failedCampaign.id },
        ...data.activity
      ]
    };
    const validated = assertDemoState(next);
    const stored: StoredWorkflowRun = {
      key: runKey,
      sessionId,
      workflowInstanceId,
      activeActionId,
      createdAt: now,
      phase: workflowSnapshot.phase,
      sourceMode: "simulated",
      featureId: recommended.id,
      featureTitle: recommended.title,
      ticketIds: plan.tickets.map((ticket) => ticket.id),
      engineeringRunIds: workstreams.map((record) => record.run.id),
      blockedCampaignId: failedCampaign.id,
      passedCampaignId: passedCampaign.id,
      releaseApprovalId: ids.releaseApproval,
      evidenceIds: recommended.evidenceIds,
      workflow: workflowSnapshot,
      agentReasoning: allAgentReasoning,
      agentEvals: allAgentEvals,
      featureBatchId,
      recommendations: pmRaw.opportunities.slice(0, 2),
      featureTracks: [
        { featureId: recommended.id, featureTitle: recommended.title, prdId: plan.implementationBrief.id, ticketIds: plan.tickets.map((ticket) => ticket.id), engineeringRunIds: workstreams.map((record) => record.run.id), blockedCampaignId: failedCampaign.id, passedCampaignId: passedCampaign.id, featureApprovalId: ids.featureApproval, releaseApprovalId: ids.releaseApproval, status: "ready_to_release" },
        ...(secondary && secondaryPlan && secondaryFailedCampaign && secondaryPassedCampaign ? [{ featureId: secondary.id, featureTitle: secondary.title, prdId: secondaryPlan.implementationBrief.id, ticketIds: secondaryPlan.tickets.map((ticket) => ticket.id), engineeringRunIds: secondaryWorkstreams.map((record) => record.run.id), blockedCampaignId: secondaryFailedCampaign.id, passedCampaignId: secondaryPassedCampaign.id, featureApprovalId: ids.secondaryFeatureApproval, releaseApprovalId: ids.secondaryReleaseApproval, status: "ready_to_release" }] : [])
      ]
    };
    await writeArtifact("demoState", validated, sessionId);
    await persistAgentRecords(sessionId, recommended, [plan.run, ...workstreams.map((record) => record.run), ...evalRuns], planningAgentEvals);
    await writeArtifact("workflowReviews", { sessionId, featureId: recommended.id, featureBatchId, recommendations: pmRaw.opportunities.slice(0, 2), implementationBrief: pm.implementationBrief, uxReview, feasibilityReview, secondary: secondary ? { featureId: secondary.id, implementationBrief: secondaryBrief, uxReview: secondaryUxAnnotated, feasibilityReview: secondaryFeasibilityAnnotated } : undefined, agentReasoning: allAgentReasoning, agentEvals: allAgentEvals }, sessionId);
    await writeArtifact("workflow", stored, sessionId);
    try {
      const allHandoffs = buildWorkflowHandoffs({ ...stored, workflowId: stored.workflow.id, evidenceIds: recommended.evidenceIds });
      const chat = createConnectorSuite({ env: process.env }).chat;
      const handoffThread = await postAgentHandoffThread(
        chat,
        existing?.handoffThread ? allHandoffs.slice(3) : allHandoffs,
        { title: `DailyCart workflow ${stored.workflow.id}`, threadId: existing?.handoffThread?.threadId }
      );
      stored.handoffFanout = await postAgentHandoffFanout(chat, allHandoffs, slackChannelMap(process.env), `DailyCart workflow ${stored.workflow.id}`);
      if (existing?.handoffThread) {
        stored.handoffThread = {
          ...existing.handoffThread,
          messages: [...existing.handoffThread.messages, ...handoffThread.messages],
          threadId: handoffThread.threadId
        };
      }
      await persistHandoffThread(root, handoffThread);
      stored.handoffThread ??= handoffThread;
      await writeArtifact("workflow", stored, sessionId);
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
