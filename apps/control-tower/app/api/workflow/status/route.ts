import { NextResponse } from "next/server";
import type { DemoStage, ProviderActivity, WorkflowAction } from "@dailycart/schemas";
import { configuredOperatorPasscode, isOperatorAuthorized } from "@/lib/operator-auth";
import { readArtifact } from "@/lib/durable-artifacts";
import { getAction, latestAction, readActions } from "@/lib/workflow-actions";
import { getDemoSession, requestSessionId } from "@/lib/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Build = {
  featureId: string;
  featureTitle?: string;
  branch?: string;
  deploymentUrl: string;
  deploymentId?: string;
  externalDeploymentId?: string;
  commitSha: string;
  commitUrl?: string;
  pullRequestUrl: string;
  pullRequestId?: string;
  sourceMode: string;
  createdAt?: string;
};

type PreviewEvaluation = {
  featureId: string;
  targetUrl: string;
  passed: boolean;
  score: number;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  sourceMode: string;
  evaluatedAt: string;
  githubRunUrl?: string;
};

type Sync = {
  ticketRecords?: Array<{ internalId?: string; externalId?: string; identifier: string; url: string; sourceMode: string }>;
  notification?: { url: string; sourceMode: string };
  handoffThread?: { messages?: Array<{ url: string; provider: string; sourceMode: string }> };
  trace?: { url: string; sourceMode: string };
  workflowEvent?: { url: string; sourceMode: string };
  errors?: string[];
};

type Run = {
  id: string;
  agent: string;
  status: string;
  featureId?: string;
  skillId?: string;
  skillVersion?: string;
  contextPackId?: string;
  citedEvidenceIds?: string[];
  reasoningSummary?: string;
  toolCalls?: Array<{ tool: string; status?: string; detail?: string }>;
  latencyMs: number;
  costUsd: number;
  retries: number;
  traceId?: string;
  startedAt?: string;
  finishedAt?: string;
  sourceMode?: string;
};

type StoredWorkflow = {
  sessionId?: string;
  workflowInstanceId?: string;
  activeActionId?: string;
  featureId?: string;
  featureTitle?: string;
  featureBatchId?: string;
  sourceMode?: string;
  recommendations?: Array<{ id: string; title: string; score: number; confidence: number; problem: string; evidenceIds?: string[] }>;
  agentReasoning?: Record<string, { model: string; summary: string; sourceMode: string }>;
  workflow?: {
    id?: string;
    phase?: string;
    revision?: number;
    featureId?: string;
    history?: Array<{ id: string; at: string; from: string | null; to: string; actor: string; reason: string; entityIds: string[] }>;
  };
};

const stageOrder: DemoStage[] = [
  "problem_context", "agent_analysis", "ranked_opportunities", "feature_approval",
  "plan_build", "preview_evals", "release_approval", "deployment_report", "outcomes_learning"
];

function activeStage(phase: string, hasRecommendations: boolean): DemoStage {
  if (["starting", "context", "agent_research", "agent_support", "agent_analytics", "agent_pm", "agent_ux", "agent_feasibility", "agent_evals"].includes(phase)) return "agent_analysis";
  if (phase === "ranked_opportunities") return "ranked_opportunities";
  if (phase === "awaiting_feature_approval") return "feature_approval";
  if (["planning", "provider_sync", "building_preview", "waiting_vercel", "preview_ready"].includes(phase)) return "plan_build";
  if (["preview_evaluating", "correcting_preview", "preview_failed"].includes(phase)) return "preview_evals";
  if (phase === "awaiting_release_approval" || phase === "ready_to_release") return "release_approval";
  if (["deploying", "released"].includes(phase)) return "deployment_report";
  if (["product_outcomes", "incident_learning"].includes(phase)) return "outcomes_learning";
  return hasRecommendations ? "ranked_opportunities" : "problem_context";
}

function providerActivities(input: {
  sync?: Sync;
  builds: Build[];
  evaluations: PreviewEvaluation[];
  action?: WorkflowAction;
  stage: DemoStage;
}): ProviderActivity[] {
  const result: ProviderActivity[] = [];
  const actionId = input.action?.actionId;
  for (const ticket of input.sync?.ticketRecords ?? []) {
    result.push({ provider: "linear", kind: "issue", label: `Open Linear issue ${ticket.identifier}`, stage: "plan_build", ticketId: ticket.internalId, externalId: ticket.externalId ?? ticket.identifier, status: "succeeded", artifactUrl: ticket.url, actionId, completedAt: input.action?.updatedAt, sourceMode: ticket.sourceMode as ProviderActivity["sourceMode"] });
  }
  if (input.sync?.notification) result.push({ provider: "slack", kind: "message", label: "Open Slack delivery message", stage: "plan_build", status: "succeeded", artifactUrl: input.sync.notification.url, actionId, completedAt: input.action?.updatedAt, sourceMode: input.sync.notification.sourceMode as ProviderActivity["sourceMode"] });
  for (const [index, message] of (input.sync?.handoffThread?.messages ?? []).entries()) {
    result.push({ provider: "slack", kind: "handoff", label: `Open agent handoff ${index + 1}`, stage: "plan_build", status: "succeeded", artifactUrl: message.url, actionId, completedAt: input.action?.updatedAt, sourceMode: message.sourceMode as ProviderActivity["sourceMode"] });
  }
  if (input.sync?.trace) result.push({ provider: "langfuse", kind: "trace", label: "Open Langfuse workflow trace", stage: "agent_analysis", status: "succeeded", artifactUrl: input.sync.trace.url, actionId, completedAt: input.action?.updatedAt, sourceMode: input.sync.trace.sourceMode as ProviderActivity["sourceMode"] });
  if (input.sync?.workflowEvent) result.push({ provider: "inngest", kind: "run", label: "Open Inngest workflow run", stage: "plan_build", status: "succeeded", dashboardUrl: input.sync.workflowEvent.url, actionId, completedAt: input.action?.updatedAt, sourceMode: input.sync.workflowEvent.sourceMode as ProviderActivity["sourceMode"] });

  for (const build of input.builds) {
    result.push({ provider: "github", kind: "pull_request", label: `Open GitHub PR · ${build.featureId}`, stage: "plan_build", featureId: build.featureId, externalId: build.pullRequestId, status: "succeeded", artifactUrl: build.pullRequestUrl, actionId, startedAt: build.createdAt, completedAt: input.action?.updatedAt, sourceMode: build.sourceMode as ProviderActivity["sourceMode"] });
    if (build.commitUrl) result.push({ provider: "github", kind: "commit", label: `View commit ${build.commitSha.slice(0, 7)}`, stage: "plan_build", featureId: build.featureId, externalId: build.commitSha, status: "succeeded", artifactUrl: build.commitUrl, actionId, completedAt: build.createdAt ?? input.action?.updatedAt, sourceMode: build.sourceMode as ProviderActivity["sourceMode"] });
    result.push({ provider: "vercel", kind: "preview", label: `Open product preview · ${build.featureId}`, stage: "plan_build", featureId: build.featureId, externalId: build.externalDeploymentId ?? build.deploymentId, status: "succeeded", artifactUrl: build.deploymentUrl, actionId, startedAt: build.createdAt, completedAt: input.action?.updatedAt, sourceMode: build.sourceMode as ProviderActivity["sourceMode"] });
    const evaluation = input.evaluations.find((item) => item.featureId === build.featureId && item.targetUrl === build.deploymentUrl);
    result.push({ provider: "github", kind: "actions_run", label: evaluation?.githubRunUrl ? `Open exact browser checks · ${build.featureId}` : `Running browser checks · ${build.featureId}`, stage: "preview_evals", featureId: build.featureId, externalId: build.commitSha, status: evaluation ? (evaluation.passed ? "succeeded" : "failed") : "pending", dashboardUrl: evaluation?.githubRunUrl, actionId, completedAt: evaluation?.evaluatedAt, error: evaluation && !evaluation.passed ? evaluation.checks.filter((check) => !check.passed).map((check) => check.detail).join(" ") : undefined, sourceMode: build.sourceMode as ProviderActivity["sourceMode"] });
  }

  if (!input.sync?.ticketRecords?.length && stageOrder.indexOf(input.stage) >= stageOrder.indexOf("plan_build")) result.push({ provider: "linear", kind: "issue", label: "Creating Linear delivery issues", stage: "plan_build", status: "pending", actionId });
  if (!input.sync?.notification && stageOrder.indexOf(input.stage) >= stageOrder.indexOf("plan_build")) result.push({ provider: "slack", kind: "message", label: "Posting Slack delivery handoff", stage: "plan_build", status: "pending", actionId });
  if (!input.builds.length && stageOrder.indexOf(input.stage) >= stageOrder.indexOf("plan_build")) {
    result.push({ provider: "github", kind: "pull_request", label: "Opening GitHub feature pull requests", stage: "plan_build", status: "pending", actionId });
    result.push({ provider: "vercel", kind: "preview", label: "Waiting for Vercel previews", stage: "plan_build", status: "pending", actionId });
  }

  const posthogUrl = process.env.POSTHOG_PROJECT_URL;
  result.push({ provider: "posthog", kind: "analytics", label: "View PostHog activity", stage: "outcomes_learning", status: posthogUrl ? "succeeded" : "unavailable", dashboardUrl: posthogUrl, error: posthogUrl ? undefined : "A safe PostHog project URL is not configured." });
  const supabaseUrl = process.env.SUPABASE_DASHBOARD_URL;
  result.push({ provider: "supabase", kind: "record", label: "Inspect persisted session records", stage: input.stage, status: supabaseUrl ? "succeeded" : "unavailable", dashboardUrl: supabaseUrl, error: supabaseUrl ? undefined : "A safe Supabase dashboard URL is not configured." });
  return result;
}

export async function GET(request: Request): Promise<Response> {
  const operator = { required: configuredOperatorPasscode(), authorized: await isOperatorAuthorized() };
  try {
    const sessionId = requestSessionId(request);
    if (!sessionId) return NextResponse.json({ started: false, session: null, workflow: null, activeStage: "problem_context", phase: "not_started", progress: 0, operator, availableActions: [{ command: "analyze", label: "Start agent analysis", enabled: true }], timeline: [], agentRuns: [], agentEvals: [], providerActivity: [], warnings: [] });
    const session = await getDemoSession(sessionId);
    if (!session || session.status !== "active") return NextResponse.json({ started: false, session: null, workflow: null, activeStage: "problem_context", phase: "not_started", progress: 0, operator, availableActions: [], timeline: [], agentRuns: [], agentEvals: [], providerActivity: [], warnings: ["The signed demo session is not active."] }, { status: 409 });

    const [stored, previews, previewEval, sync, demoState, reviews, actions, productEvents] = await Promise.all([
      readArtifact<StoredWorkflow>("workflow", sessionId),
      readArtifact<{ builds?: Build[] }>("workflowPreview", sessionId),
      readArtifact<{ evaluations?: PreviewEvaluation[]; allPassed?: boolean; errorCode?: string; errorDetail?: string }>("workflowPreviewEval", sessionId),
      readArtifact<Sync>("workflowSync", sessionId),
      readArtifact<{ runs?: Run[]; approvals?: Array<{ id: string; stage: string; status: string; rationale?: string; reviewer?: string; resolvedAt?: string }>; campaigns?: Array<{ id: string; weightedScore: number; releaseAllowed: boolean }>; deployments?: Array<{ id: string; status: string; url?: string }>; incidents?: Array<{ id: string }>; activity?: Array<{ at: string; type: string; title: string; detail: string; entityId: string }> }>("demoState", sessionId),
      readArtifact<{ agentEvals?: Array<{ id?: string; runId: string; criterion: string; score: number; passed: boolean; rationale: string; mode: string }>; recommendations?: Array<{ id: string; title: string; risks?: string[]; evidenceIds?: string[] }>; uxReview?: unknown; feasibilityReview?: unknown }>("workflowReviews", sessionId),
      readActions(sessionId),
      readArtifact<unknown[]>("productEvents", sessionId)
    ]);

    const activeAction = stored?.activeActionId ? await getAction(stored.activeActionId, sessionId) : latestAction(actions, sessionId);
    const durablePhase = activeAction && ["queued", "running", "waiting_human", "failed"].includes(activeAction.status) ? activeAction.phase : stored?.workflow?.phase ?? "not_started";
    const phase = durablePhase === "released" && (demoState?.incidents?.length ?? 0) > 0
      ? "incident_learning"
      : durablePhase === "released" && (productEvents?.length ?? 0) > 0
        ? "product_outcomes"
        : activeAction?.command === "declare_incident" && activeAction.status === "succeeded"
          ? "incident_learning"
          : durablePhase;
    const stage = activeStage(phase, Boolean(stored?.recommendations?.length));
    const builds = previews?.builds ?? [];
    const evaluations = previewEval?.evaluations ?? [];
    const runs = demoState?.runs ?? [];
    const agentEvals = reviews?.agentEvals ?? [];
    const activities = providerActivities({ sync, builds, evaluations, action: activeAction, stage });
    const runningStep = activeAction?.steps.find((step) => step.status === "running") ?? activeAction?.steps.findLast((step) => step.status === "succeeded");
    const latestRun = runningStep?.relatedRunIds?.map((id) => runs.find((run) => run.id === id)).find(Boolean)
      ?? [...runs].sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""))[0];
    const provenanceWarnings = runs.flatMap((run) => [
      !run.skillId || !run.skillVersion ? `${run.id} is missing an executable skill/version.` : undefined,
      !run.contextPackId ? `${run.id} is missing its context-pack ID.` : undefined,
      !run.citedEvidenceIds?.length ? `${run.id} is missing cited evidence.` : undefined
    ].filter((item): item is string => Boolean(item)));
    const activeAgent = runningStep || latestRun ? {
      role: runningStep?.agent ?? latestRun?.agent ?? "operator",
      runId: latestRun?.id,
      skillId: runningStep?.skillId ?? latestRun?.skillId,
      skillVersion: latestRun?.skillVersion,
      contextPackId: latestRun?.contextPackId,
      evidenceIds: latestRun?.citedEvidenceIds ?? [],
      task: runningStep?.label ?? activeAction?.message ?? "Inspecting session state",
      reasoningSummary: latestRun?.reasoningSummary,
      toolCalls: latestRun?.toolCalls ?? [],
      model: latestRun ? (stored?.agentReasoning?.[latestRun.agent]?.model
        ?? Object.entries(stored?.agentReasoning ?? {}).find(([key]) => key.replaceAll("-", "_").startsWith(latestRun.agent.replaceAll("-", "_")))?.[1].model) : undefined,
      sourceMode: latestRun?.sourceMode,
      latencyMs: latestRun?.latencyMs ?? 0,
      costUsd: latestRun?.costUsd ?? 0,
      retries: latestRun?.retries ?? 0,
      status: runningStep?.status ?? latestRun?.status ?? "running",
      evaluations: latestRun ? agentEvals.filter((item) => item.runId === latestRun.id) : []
    } : undefined;

    const allPassed = Boolean(previewEval?.allPassed);
    const availableActions = activeAction?.status === "failed"
      ? [{ command: "retry", label: "Retry failed step", enabled: true }]
      : phase === "awaiting_feature_approval"
        ? [{ command: "approve_feature", label: "Approve feature tracks", enabled: provenanceWarnings.length === 0 }]
        : phase === "awaiting_release_approval"
          ? [{ command: "approve_release", label: "Approve release", enabled: allPassed && !(sync?.errors?.length) }]
          : ["released", "product_outcomes"].includes(phase)
            ? [{ command: "declare_incident", label: "Record an incident", enabled: true }]
            : !activeAction || ["succeeded"].includes(activeAction.status)
              ? [{ command: "analyze", label: "Analyze opportunities", enabled: !stored?.workflow }]
              : [];

    const actionForTimeline = activeAction;
    const actionIdForTimeline = actionForTimeline?.actionId ?? "workflow";
    const actionUpdatedAt = actionForTimeline?.updatedAt ?? session.updatedAt;
    const timeline = [
      ...(stored?.workflow?.history ?? []).map((event) => ({ id: event.id, at: event.at, kind: "workflow", title: event.to.replaceAll("_", " "), detail: event.reason, actor: event.actor, entityIds: event.entityIds })),
      ...(actionForTimeline?.steps ?? []).map((step) => ({ id: `${actionIdForTimeline}:${step.id}`, at: step.completedAt ?? step.startedAt ?? actionUpdatedAt, kind: "action", title: step.label, detail: step.detail, status: step.status, actor: step.agent, provider: step.provider, links: step.links ?? [] })),
      ...(demoState?.activity ?? []).map((event) => ({ id: `${event.entityId}:${event.at}`, at: event.at, kind: event.type, title: event.title, detail: event.detail, entityIds: [event.entityId] }))
    ].sort((a, b) => a.at.localeCompare(b.at));

    const progress = activeAction?.progress ?? Math.round((stageOrder.indexOf(stage) / (stageOrder.length - 1)) * 100);
    const workflow = { workflowId: session.workflowId, phase, revision: stored?.workflow?.revision ?? 0, featureId: stored?.workflow?.featureId ?? stored?.featureId, featureTitle: stored?.featureTitle, featureBatchId: stored?.featureBatchId };
    const completionSummary = ["released", "product_outcomes", "incident_learning"].includes(phase) ? {
      sessionId, workflowId: session.workflowId, startedAt: activeAction?.createdAt ?? session.createdAt, completedAt: activeAction?.updatedAt,
      durationMs: activeAction ? Math.max(0, Date.parse(activeAction.updatedAt) - Date.parse(activeAction.createdAt)) : 0,
      agents: runs.map((run) => ({ runId: run.id, role: run.agent, skillId: run.skillId, status: run.status, latencyMs: run.latencyMs, costUsd: run.costUsd })),
      decisions: (demoState?.approvals ?? []).map((approval) => ({ id: approval.id, stage: approval.stage, status: approval.status, rationale: approval.rationale })),
      builds: builds.map((build) => ({ featureId: build.featureId, commitSha: build.commitSha, previewUrl: build.deploymentUrl, pullRequestUrl: build.pullRequestUrl })),
      evals: evaluations.map((evaluation) => ({ featureId: evaluation.featureId, score: evaluation.score, passed: evaluation.passed, targetUrl: evaluation.targetUrl })),
      providerActions: activities,
      telemetry: { totalCostUsd: runs.reduce((sum, run) => sum + run.costUsd, 0), totalLatencyMs: runs.reduce((sum, run) => sum + run.latencyMs, 0), retries: runs.reduce((sum, run) => sum + run.retries, 0) },
      warnings: [...(sync?.errors ?? []), ...provenanceWarnings]
    } : undefined;

    return NextResponse.json({
      started: Boolean(stored?.workflow || activeAction),
      session,
      sessionId,
      workflow,
      workflowId: session.workflowId,
      activeStage: stage,
      stageIndex: stageOrder.indexOf(stage),
      stages: stageOrder,
      phase,
      progress,
      operator,
      activeAction,
      availableActions,
      timeline,
      activeAgent,
      agentRuns: runs,
      agentEvals,
      approvalPacket: phase === "awaiting_feature_approval" ? { kind: "feature", recommendations: stored?.recommendations ?? reviews?.recommendations ?? [], agents: runs, agentEvals, uxReview: reviews?.uxReview, feasibilityReview: reviews?.feasibilityReview, risks: (reviews?.recommendations ?? []).flatMap((item) => item.risks ?? []) } : phase === "awaiting_release_approval" ? { kind: "release", builds, evaluations, providers: activities, errors: sync?.errors ?? [] } : undefined,
      providerActivity: activities,
      providerRecords: sync ?? { ticketRecords: [], errors: [] },
      builds,
      previews: builds,
      previewEvals: evaluations,
      previewEvaluations: evaluations,
      previewAllPassed: allPassed,
      previewError: previewEval?.errorCode ? { code: previewEval.errorCode, detail: previewEval.errorDetail } : undefined,
      recommendations: stored?.recommendations ?? reviews?.recommendations ?? [],
      completionSummary,
      phaseSummary: { completed: activeAction?.steps.filter((step) => step.status === "succeeded").map((step) => step.label) ?? [], running: runningStep?.label, next: activeAction?.nextAction ?? (phase === "released" ? "Review the delivery report and product outcomes." : "Start with the problem and company evidence.") },
      warnings: [...(sync?.errors ?? []), ...provenanceWarnings]
    });
  } catch (error) {
    return NextResponse.json({ started: false, session: null, workflow: null, activeStage: "problem_context", phase: "failed", progress: 0, operator, availableActions: [], timeline: [], agentRuns: [], agentEvals: [], providerActivity: [], warnings: [error instanceof Error ? error.message : "The session status could not be loaded."] }, { status: 500 });
  }
}
