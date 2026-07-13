import path from "node:path";
import { createHash } from "node:crypto";
import { analyzeProductEvidence, annotateAgentRun, createImplementationBrief, createPlanningAndDeliveryLineage, createTpmPlan, executeIndependentEngineeringWorkstreams, loadCompanyContextPack, runEngineeringFeasibilityReview, runLiveAgentReasoning, runUxReview } from "@dailycart/agents";
import { ConnectorError, createConnectorSuite, postAgentHandoffFanout, postAgentHandoffThread, type AgentHandoffFanoutResult, type AgentHandoffThreadResult } from "@dailycart/connectors";
import { createSemanticJudge, EvidenceGroundingGrader, RequiredFieldsGrader } from "@dailycart/evals";
import { DeliveryWorkflow } from "@dailycart/workflow";
import { agentRunSchema, assertDemoState, decisionSchema, evalCaseSchema, type AgentRun, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { buildWorkflowHandoffs, persistHandoffThread } from "@/lib/workflow-handoffs";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { persistStructuredRecord, readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { getDemoSession } from "@/lib/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUN_KEY = "v1-cohesive-multi-agent";
type AgentOutputEval = { id: string; runId: string; skillId: string; criterion: string; grader: string; score: number; passed: boolean; rationale: string; mode: "deterministic" | "live-judge" | "mocked-judge"; evaluatedAt: string };
type AgentReasoning = { model: string; summary: string; sourceMode: "live" | "deterministic-fallback" };

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
  executionMode?: "showcase" | "full_verification";
};

function rootPath(): string {
  return path.resolve(process.cwd(), "../..");
}

function sessionIdentifiers(sessionId: string) {
  const base = 10_000_000 + (Number.parseInt(createHash("sha256").update(sessionId).digest("hex").slice(0, 8), 16) % 80_000_000);
  const id = (prefix: string, offset: number) => `${prefix}-${base + offset}`;
  return {
    batch: id("BATCH", 1), project: id("PROJ", 2),
    context: id("RUN", 3), research: id("RUN", 4), support: id("RUN", 5), analytics: id("RUN", 6),
    pm: id("RUN", 10), ux: id("RUN", 11), feasibility: id("RUN", 12), plan: id("RUN", 13), agentEval: id("RUN", 14),
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

function insightRun(input: {
  id: string;
  agent: "context" | "research" | "support" | "analytics";
  skillId: "context-retrieval" | "interview-synthesis" | "support-ticket-clustering" | "analytics-anomaly-analysis";
  featureId: string;
  featureBatchId: string;
  contextPackId: string;
  evidenceIds: string[];
  summary: string;
  model: string;
  sourceMode: "live" | "deterministic-fallback";
  now: string;
}): AgentRun {
  return annotateAgentRun(agentRunSchema.parse({
    id: input.id,
    agent: input.agent,
    status: "succeeded",
    startedAt: input.now,
    finishedAt: input.now,
    featureId: input.featureId,
    ticketIds: [],
    traceId: `trace-${input.agent}-${input.id.toLowerCase()}`,
    costUsd: 0,
    latencyMs: 0,
    retries: 0,
    steps: [{
      name: "Analyze cited evidence",
      status: "succeeded",
      durationMs: 0,
      detail: `${input.evidenceIds.length} evidence records were summarized through the ${input.skillId} contract.`
    }],
    sourceMode: input.sourceMode === "live" ? "live" : "simulated"
  }), {
    skillId: input.skillId,
    contextPackId: input.contextPackId,
    featureBatchId: input.featureBatchId,
    citedEvidenceIds: input.evidenceIds,
    reasoningSummary: input.summary,
    toolCalls: [{
      name: input.skillId,
      provider: input.sourceMode === "live" ? input.model : "deterministic-role-engine",
      status: "succeeded",
      detail: `Produced an operator-safe ${input.agent} synthesis from ${input.evidenceIds.length} cited records.`
    }]
  });
}

function evalOpsRun(input: {
  id: string;
  featureId: string;
  featureBatchId: string;
  contextPackId: string;
  evidenceIds: string[];
  evaluatedRuns: AgentRun[];
  evaluations: AgentOutputEval[];
  now: string;
  sourceMode: "simulated" | "live";
}): AgentRun {
  const blocking = input.evaluations.filter((evaluation) => !evaluation.passed && evaluation.mode !== "mocked-judge");
  const liveJudges = input.evaluations.filter((evaluation) => evaluation.mode === "live-judge");
  const graderMode = liveJudges.length ? "deterministic checks + live model judge" : "deterministic checks + labelled fallback judge";
  return annotateAgentRun(agentRunSchema.parse({
    id: input.id,
    agent: "eval",
    status: blocking.length ? "blocked" : "succeeded",
    startedAt: input.now,
    finishedAt: input.now,
    featureId: input.featureId,
    ticketIds: [],
    traceId: `trace-agent-evals-${input.id.toLowerCase()}`,
    costUsd: 0,
    latencyMs: 0,
    retries: 0,
    steps: input.evaluatedRuns.map((run) => {
      const results = input.evaluations.filter((evaluation) => evaluation.runId === run.id);
      const passed = results.every((evaluation) => evaluation.passed || evaluation.mode === "mocked-judge");
      return {
        name: `Evaluate ${run.agent} output`,
        status: passed ? "succeeded" as const : "blocked" as const,
        durationMs: 0,
        detail: `${results.length} linked criteria ran for ${run.id}; ${results.filter((evaluation) => evaluation.passed).length} passed.`
      };
    }),
    sourceMode: input.sourceMode
  }), {
    skillId: "agent-output-evaluation",
    contextPackId: input.contextPackId,
    featureBatchId: input.featureBatchId,
    citedEvidenceIds: input.evidenceIds,
    reasoningSummary: `${input.evaluations.length} evaluation results were linked to ${input.evaluatedRuns.length} agent runs using ${graderMode}. ${blocking.length ? `${blocking.length} release-blocking integrity failures remain.` : "No release-blocking integrity failure remains."}`,
    toolCalls: input.evaluations.map((evaluation) => ({
      name: evaluation.criterion,
      provider: evaluation.grader,
      status: evaluation.passed ? "succeeded" as const : "failed" as const,
      detail: `${evaluation.runId}: ${evaluation.score}/100 (${evaluation.mode}).`,
      externalId: evaluation.id
    }))
  });
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
  const session = await getDemoSession(sessionId);
  const executionMode = request.headers.get("x-dailycart-execution-mode") === "full_verification" || session?.executionMode === "full_verification" ? "full_verification" as const : "showcase" as const;
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
    const savedAnalysis = featureApproved && existing?.phase === "awaiting_feature_approval"
      ? await readArtifact<{ agentReasoning?: Record<string, AgentReasoning>; agentEvals?: AgentOutputEval[] }>("workflowReviews", sessionId)
      : undefined;
    const reasoningFor = async (key: string, input: { role: string; task: string; context: unknown }): Promise<AgentReasoning> =>
      savedAnalysis?.agentReasoning?.[key] ?? runLiveAgentReasoning(input);
    const pmRaw = analyzeProductEvidence(evidence, {
      runId: ids.pm,
      now,
      maxOpportunities: 3,
      sourceMode: "simulated"
    });
    const selected = pmRaw.opportunities[0]!;
    const researchEvidenceIds = evidence.filter((item) => ["interview", "survey", "discussion"].includes(item.kind)).map((item) => item.id).slice(0, 8);
    const supportEvidenceIds = evidence.filter((item) => item.kind === "support").map((item) => item.id).slice(0, 8);
    const analyticsEvidenceIds = evidence.filter((item) => ["analytics", "incident"].includes(item.kind)).map((item) => item.id).slice(0, 8);
    const citedResearch = researchEvidenceIds.length ? researchEvidenceIds : selected.evidenceIds;
    const citedSupport = supportEvidenceIds.length ? supportEvidenceIds : selected.evidenceIds;
    const citedAnalytics = analyticsEvidenceIds.length ? analyticsEvidenceIds : selected.evidenceIds;
    const pmReasoning = await reasoningFor("pm", { role: "PM agent", task: "Explain the selected opportunity and why it is ranked first.", context: { feature: selected, evidenceIds: selected.evidenceIds } });
    const pm = { ...pmRaw, run: { ...annotateAgentRun(pmRaw.run, { skillId: "feature-prioritization", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: pmRaw.evidenceIds, reasoningSummary: pmReasoning.summary, toolCalls: [{ name: "feature-prioritization", provider: pmReasoning.model, status: "succeeded", detail: `Ranked ${pmRaw.opportunities.length} opportunities from ${pmRaw.evidenceIds.length} cited evidence records.` }] }), sourceMode: pmReasoning.sourceMode === "live" ? "live" as const : "simulated" as const } };
    const uxRaw = runUxReview(selected, pm.implementationBrief, { now, sourceMode: "simulated", runId: ids.ux });
    const feasibilityRaw = runEngineeringFeasibilityReview(selected, pm.implementationBrief, { now, sourceMode: "simulated", runId: ids.feasibility });
    const reasoningResults = await Promise.all([
      ["research", { role: "Research agent", task: "Synthesize interview and survey evidence into customer needs and conflicts.", context: { evidence: evidence.filter((item) => citedResearch.includes(item.id)), feature: selected } }],
      ["support", { role: "Support insight agent", task: "Cluster recurring support problems, severity, and journey stage.", context: { evidence: evidence.filter((item) => citedSupport.includes(item.id)), feature: selected } }],
      ["analytics", { role: "Analytics agent", task: "Summarize funnel, incident, and behavioral signals relevant to the opportunity.", context: { evidence: evidence.filter((item) => citedAnalytics.includes(item.id)), feature: selected } }],
      ["ux", { role: "UX agent", task: "Summarize the journey and accessibility review.", context: uxRaw }],
      ["engineering-feasibility", { role: "Engineering feasibility agent", task: "Summarize affected surfaces, risks, and preview requirements.", context: feasibilityRaw }]
    ].map(async ([key, input]) => [key, await reasoningFor(key as string, input as { role: string; task: string; context: unknown })] as const));
    const agentReasoning = Object.fromEntries([["pm", pmReasoning] as const, ...reasoningResults]);
    const researchReasoning = agentReasoning.research!;
    const supportReasoning = agentReasoning.support!;
    const analyticsReasoning = agentReasoning.analytics!;
    const uxReasoning = agentReasoning.ux!;
    const feasibilityReasoning = agentReasoning["engineering-feasibility"]!;
    const contextRun = insightRun({ id: ids.context, agent: "context", skillId: "context-retrieval", featureId: selected.id, featureBatchId, contextPackId: contextPack.version, evidenceIds: contextPack.evidenceIds.slice(0, 12), summary: `Loaded company context pack ${contextPack.version} and validated ${contextPack.evidenceIds.length} evidence references before agent execution.`, model: "deterministic-context-loader", sourceMode: "deterministic-fallback", now });
    const researchRun = insightRun({ id: ids.research, agent: "research", skillId: "interview-synthesis", featureId: selected.id, featureBatchId, contextPackId: contextPack.version, evidenceIds: citedResearch, summary: researchReasoning.summary, model: researchReasoning.model, sourceMode: researchReasoning.sourceMode, now });
    const supportRun = insightRun({ id: ids.support, agent: "support", skillId: "support-ticket-clustering", featureId: selected.id, featureBatchId, contextPackId: contextPack.version, evidenceIds: citedSupport, summary: supportReasoning.summary, model: supportReasoning.model, sourceMode: supportReasoning.sourceMode, now });
    const analyticsRun = insightRun({ id: ids.analytics, agent: "analytics", skillId: "analytics-anomaly-analysis", featureId: selected.id, featureBatchId, contextPackId: contextPack.version, evidenceIds: citedAnalytics, summary: analyticsReasoning.summary, model: analyticsReasoning.model, sourceMode: analyticsReasoning.sourceMode, now });
    const uxReview = { ...uxRaw, run: { ...annotateAgentRun(uxRaw.run, { skillId: "ux-review", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: selected.evidenceIds, reasoningSummary: uxReasoning.summary, toolCalls: [{ name: "ux-review", provider: uxReasoning.model, status: "succeeded", detail: "Reviewed interaction clarity, keyboard behavior, focus restoration, and accessible recovery copy." }] }), sourceMode: uxReasoning.sourceMode === "live" ? "live" as const : "simulated" as const } };
    const feasibilityReview = { ...feasibilityRaw, run: { ...annotateAgentRun(feasibilityRaw.run, { skillId: "engineering-feasibility-review", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: selected.evidenceIds, reasoningSummary: feasibilityReasoning.summary, toolCalls: [{ name: "engineering-feasibility-review", provider: feasibilityReasoning.model, status: "succeeded", detail: "Reviewed affected surfaces, dependencies, telemetry, delivery risk, and preview requirements." }] }), sourceMode: feasibilityReasoning.sourceMode === "live" ? "live" as const : "simulated" as const } };
    const evaluatedAgentRuns = [researchRun, supportRun, analyticsRun, pm.run, uxReview.run, feasibilityReview.run];
    const persistedAnalysisEvals = savedAnalysis?.agentEvals?.filter((evaluation) => evaluatedAgentRuns.some((run) => run.id === evaluation.runId)) ?? [];
    const agentEvals = persistedAnalysisEvals.length === evaluatedAgentRuns.length * 3 ? persistedAnalysisEvals : (await Promise.all([
      evaluateAgentOutput({ run: researchRun, actual: { featureId: selected.id, evidenceIds: citedResearch, summary: researchReasoning.summary }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "summary"], semanticCriteria: ["customer language is preserved", "conflicts and needs are explicit", "claims are evidence grounded"], ordinal: 1, now }),
      evaluateAgentOutput({ run: supportRun, actual: { featureId: selected.id, evidenceIds: citedSupport, summary: supportReasoning.summary }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "summary"], semanticCriteria: ["recurrence and severity are addressed", "journey stage is clear", "claims are evidence grounded"], ordinal: 2, now }),
      evaluateAgentOutput({ run: analyticsRun, actual: { featureId: selected.id, evidenceIds: citedAnalytics, summary: analyticsReasoning.summary }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "summary"], semanticCriteria: ["baseline or behavioral signal is explicit", "measurement limits are acknowledged", "claims are evidence grounded"], ordinal: 3, now }),
      evaluateAgentOutput({ run: pm.run, actual: { featureId: selected.id, evidenceIds: selected.evidenceIds, implementationBrief: pm.implementationBrief, rankingScore: selected.score }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "implementationBrief", "rankingScore"], semanticCriteria: ["opportunity ranking is evidence grounded", "problem and outcome are explicit", "acceptance criteria are measurable"], ordinal: 4, now }),
      evaluateAgentOutput({ run: uxReview.run, actual: { featureId: selected.id, evidenceIds: selected.evidenceIds, findings: uxReview.findings, reviewType: uxReview.reviewType }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "findings", "reviewType"], semanticCriteria: ["keyboard behavior covered", "focus restoration covered", "accessibility risks are actionable"], ordinal: 5, now }),
      evaluateAgentOutput({ run: feasibilityReview.run, actual: { featureId: selected.id, evidenceIds: selected.evidenceIds, findings: feasibilityReview.findings, reviewType: feasibilityReview.reviewType }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "findings", "reviewType"], semanticCriteria: ["affected surfaces identified", "telemetry requirements covered", "preview and delivery risks bounded"], ordinal: 6, now })
    ])).flat();
    const evalRun = evalOpsRun({ id: ids.agentEval, featureId: selected.id, featureBatchId, contextPackId: contextPack.version, evidenceIds: [...new Set(evaluatedAgentRuns.flatMap((run) => run.citedEvidenceIds ?? []))], evaluatedRuns: evaluatedAgentRuns, evaluations: agentEvals, now, sourceMode: executionSourceMode });
    const analysisRuns = [contextRun, ...evaluatedAgentRuns, evalRun];
    agentReasoning.eval = {
      model: agentEvals.some((evaluation) => evaluation.mode === "live-judge") ? "deterministic graders + live model judge" : "deterministic graders + labelled fallback judge",
      summary: evalRun.reasoningSummary ?? "Agent-output evaluation completed.",
      sourceMode: agentEvals.some((evaluation) => evaluation.mode === "live-judge") ? "live" : "deterministic-fallback"
    };
    if (!savedAnalysis) {
      await persistAgentRecords(sessionId, selected, analysisRuns, agentEvals);
      const analysisState = await loadDemoState(sessionId);
      await writeArtifact("demoState", assertDemoState({
        ...analysisState,
        generatedAt: now,
        sourceMode: executionSourceMode,
        features: appendUnique(analysisState.features.filter((feature) => feature.id !== selected.id), [selected]),
        runs: appendUnique(analysisState.runs, analysisRuns),
        activity: [{ at: now, type: "agent-analysis", title: "Evidence-linked agent analysis completed", detail: `${analysisRuns.length} session-scoped runs and ${agentEvals.length} output evaluations were persisted before feature approval.`, entityId: selected.id }, ...analysisState.activity]
      }), sessionId);
    }
    const blockingAgentEvals = agentEvals.filter((evaluation) => !evaluation.passed && evaluation.mode !== "mocked-judge");
    if (blockingAgentEvals.length) {
      await writeArtifact("workflowReviews", { sessionId, featureId: selected.id, featureBatchId, implementationBrief: pm.implementationBrief, uxReview, feasibilityReview, agentReasoning, agentEvals, blocked: true }, sessionId);
      return NextResponse.json({ ok: false, message: "Agent output evaluation blocked feature approval.", detail: blockingAgentEvals.map((evaluation) => `${evaluation.criterion}: ${evaluation.rationale}`).join("; "), agentEvals }, { status: 422 });
    }
    if (!featureApproved) {
      const pendingWorkflow = DeliveryWorkflow.start({ id: ids.project, featureId: selected.id, actor: "pm-agent", sourceMode: "simulated" }, () => now);
      pendingWorkflow.requestFeatureApproval(ids.featureApproval, "pm-agent");
      const pending = {
        key: runKey, sessionId, workflowInstanceId, activeActionId, createdAt: now, phase: pendingWorkflow.snapshot().phase, sourceMode: executionSourceMode, executionMode,
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
      return NextResponse.json({ ok: true, featureApprovalRequired: true, progressRunIds: { context: contextRun.id, research: researchRun.id, support: supportRun.id, analytics: analyticsRun.id, pm: pm.run.id, ux: uxReview.run.id, feasibility: feasibilityReview.run.id, "agent-evals": evalRun.id }, workflow: { ...pending, recommendation: selected, recommendations: pmRaw.opportunities.slice(0, 2), uxReview, feasibilityReview, implementationBrief: pm.implementationBrief, featureBatchId } });
    }
    const recommended = { ...selected, status: "approved" as const, sourceMode: "simulated" as const };
    const planRaw = createTpmPlan(recommended, { implementationBrief: pm.implementationBrief, runId: ids.plan, now, ticketStartOrdinal: ids.primaryTicketStart });
    const plan = { ...planRaw, run: annotateAgentRun(planRaw.run, { skillId: "implementation-planning", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: recommended.evidenceIds }) };
    const planningAgentEvals = await evaluateAgentOutput({ run: plan.run, actual: { featureId: recommended.id, evidenceIds: recommended.evidenceIds, tickets: plan.tickets, implementationBriefId: plan.implementationBrief.id }, allowedEvidenceIds: contextPack.evidenceIds, requiredFields: ["featureId", "evidenceIds", "tickets", "implementationBriefId"], semanticCriteria: ["workstreams and ownership are clear", "dependencies and milestones are actionable", "readiness risks are explicit"], ordinal: 7, now });
    const planningBlockers = planningAgentEvals.filter((evaluation) => !evaluation.passed && evaluation.mode !== "mocked-judge");
    if (planningBlockers.length) { await writeArtifact("workflowReviews", { sessionId, featureId: recommended.id, featureBatchId, agentReasoning, agentEvals: [...agentEvals, ...planningAgentEvals], blocked: true }, sessionId); return NextResponse.json({ ok: false, message: "Delivery planning evaluation blocked implementation.", detail: planningBlockers.map((evaluation) => evaluation.rationale).join("; ") }, { status: 422 }); }
    const allAgentEvals = [...agentEvals, ...planningAgentEvals];
    const workstreamRaw = await executeIndependentEngineeringWorkstreams(recommended, plan.tickets, { runStartOrdinal: ids.engineeringStart });
    const workstreams = workstreamRaw.map((record) => ({ ...record, run: annotateAgentRun(record.run, { skillId: "code-implementation", contextPackId: contextPack.version, featureBatchId, citedEvidenceIds: recommended.evidenceIds }) }));
    const secondaryCandidate = executionMode === "full_verification" ? pmRaw.opportunities[1] : undefined;
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
    if (secondary && secondaryUxAnnotated && secondaryFeasibilityAnnotated && secondaryPlan) await persistAgentRecords(sessionId, secondary, [secondaryUxAnnotated.run, secondaryFeasibilityAnnotated.run, secondaryPlan.run, ...secondaryWorkstreams.map((record) => record.run)], []);

    const workflow = DeliveryWorkflow.start({ id: ids.project, featureId: recommended.id, actor: "pm-agent", sourceMode: "simulated" }, () => now);
    workflow.requestFeatureApproval(ids.featureApproval, "pm-agent");
    workflow.resumeWithHumanDecision({ approvalId: ids.featureApproval, status: "approved", reviewer: "product-council", rationale: "Evidence-backed scope approved for delivery.", decisionId: ids.decision, resolvedAt: now });
    workflow.completePlanning(plan.tickets.map((ticket) => ticket.id), "tpm-agent");
    workflow.completeDelivery(workstreams.map((record) => record.run.id), "engineering-agent");
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
        ...(secondary ? [{ id: ids.secondaryFeatureApproval, featureId: secondary.id, stage: "feature" as const, status: "approved" as const, requestedAt: now, resolvedAt: now, reviewer: "product-council", rationale: "Second evidence-ranked feature track approved for parallel delivery.", sourceMode: "simulated" as const }] : [])
      ]),
      runs: appendUnique(data.runs, [plan.run, ...workstreams.map((record) => record.run), ...(secondary && secondaryUxAnnotated && secondaryFeasibilityAnnotated && secondaryPlan ? [secondaryUxAnnotated.run, secondaryFeasibilityAnnotated.run, secondaryPlan.run, ...secondaryWorkstreams.map((record) => record.run)] : [])]),
      lineage: appendUnique(data.lineage, [...createPlanningAndDeliveryLineage({ evidenceIds: recommended.evidenceIds, featureId: recommended.id, decisionId: decision.id, prdId: plan.implementationBrief.id, tickets: plan.tickets, workstreams, createdAt: now }), ...(secondary && secondaryPlan && secondaryUxAnnotated && secondaryFeasibilityAnnotated ? createPlanningAndDeliveryLineage({ evidenceIds: secondary.evidenceIds, featureId: secondary.id, decisionId: ids.secondaryDecision, prdId: secondaryPlan.implementationBrief.id, tickets: secondaryPlan.tickets, workstreams: secondaryWorkstreams, createdAt: now }) : [])]),
      activity: [
        { at: now, type: "workflow", title: "Delivery candidate prepared", detail: `${recommended.title} is entering real preview deployment and browser evaluation.`, entityId: recommended.id },
        ...data.activity
      ]
    };
    const validated = assertDemoState(next);
    const stored: StoredWorkflowRun = {
      key: runKey,
      executionMode,
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
      blockedCampaignId: ids.blockedCampaign,
      passedCampaignId: ids.passedCampaign,
      releaseApprovalId: ids.releaseApproval,
      evidenceIds: recommended.evidenceIds,
      workflow: workflowSnapshot,
      agentReasoning: allAgentReasoning,
      agentEvals: allAgentEvals,
      featureBatchId,
      recommendations: pmRaw.opportunities.slice(0, 2),
      featureTracks: [
        { featureId: recommended.id, featureTitle: recommended.title, prdId: plan.implementationBrief.id, ticketIds: plan.tickets.map((ticket) => ticket.id), engineeringRunIds: workstreams.map((record) => record.run.id), blockedCampaignId: ids.blockedCampaign, passedCampaignId: ids.passedCampaign, featureApprovalId: ids.featureApproval, releaseApprovalId: ids.releaseApproval, status: "in_evaluation" },
        ...(secondary && secondaryPlan ? [{ featureId: secondary.id, featureTitle: secondary.title, prdId: secondaryPlan.implementationBrief.id, ticketIds: secondaryPlan.tickets.map((ticket) => ticket.id), engineeringRunIds: secondaryWorkstreams.map((record) => record.run.id), blockedCampaignId: ids.secondaryBlockedCampaign, passedCampaignId: ids.secondaryPassedCampaign, featureApprovalId: ids.secondaryFeatureApproval, releaseApprovalId: ids.secondaryReleaseApproval, status: "in_evaluation" }] : [])
      ]
    };
    await writeArtifact("demoState", validated, sessionId);
    await persistAgentRecords(sessionId, recommended, [plan.run, ...workstreams.map((record) => record.run)], planningAgentEvals);
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
