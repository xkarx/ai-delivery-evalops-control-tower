import { NextResponse } from "next/server";
import { configuredOperatorPasscode, isOperatorAuthorized } from "@/lib/operator-auth";
import { readArtifact } from "@/lib/durable-artifacts";
import { getAction, latestAction, readActions } from "@/lib/workflow-actions";
import { getPresentation } from "@/lib/workflow-presentation";
import type { ProviderActivity } from "@dailycart/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Build = { featureId: string; deploymentUrl: string; deploymentId?: string; externalDeploymentId?: string; commitSha: string; commitUrl?: string; pullRequestUrl: string; pullRequestId?: string; sourceMode: string; createdAt?: string };
type Sync = { ticketRecords?: Array<{ internalId?: string; externalId?: string; identifier: string; url: string; sourceMode: string }>; notification?: { url: string; sourceMode: string }; trace?: { url: string; sourceMode: string }; workflowEvent?: { url: string; sourceMode: string }; errors?: string[] };

function providerActivity(input: { sync?: Sync; builds: Build[]; action?: Awaited<ReturnType<typeof getAction>>; previewEvaluations: Array<{ featureId: string; targetUrl: string; passed: boolean; evaluatedAt?: string; sourceMode?: string }> }): ProviderActivity[] {
  const result: ProviderActivity[] = [];
  for (const ticket of input.sync?.ticketRecords ?? []) result.push({ provider: "linear", kind: "issue", label: `Open Linear issue ${ticket.identifier}`, externalId: ticket.externalId ?? ticket.identifier, status: "succeeded", artifactUrl: ticket.url, completedAt: input.action?.updatedAt, sourceMode: ticket.sourceMode as ProviderActivity["sourceMode"] });
  if (input.sync?.notification) result.push({ provider: "slack", kind: "thread", label: "Open Slack delivery thread", status: "succeeded", artifactUrl: input.sync.notification.url, completedAt: input.action?.updatedAt, sourceMode: input.sync.notification.sourceMode as ProviderActivity["sourceMode"] });
  if (input.sync?.trace) result.push({ provider: "langfuse", kind: "trace", label: "Open Langfuse trace", status: "succeeded", artifactUrl: input.sync.trace.url, completedAt: input.action?.updatedAt, sourceMode: input.sync.trace.sourceMode as ProviderActivity["sourceMode"] });
  if (input.sync?.workflowEvent) result.push({ provider: "inngest", kind: "run", label: "Open Inngest run", status: "succeeded", dashboardUrl: input.sync.workflowEvent.url, completedAt: input.action?.updatedAt, sourceMode: input.sync.workflowEvent.sourceMode as ProviderActivity["sourceMode"] });
  const repository = process.env.GITHUB_DEFAULT_REPOSITORY;
  for (const build of input.builds) {
    result.push({ provider: "github", kind: "pull_request", label: `Open GitHub PR · ${build.featureId}`, externalId: build.pullRequestId, status: "succeeded", artifactUrl: build.pullRequestUrl, startedAt: build.createdAt, completedAt: input.action?.updatedAt, sourceMode: build.sourceMode as ProviderActivity["sourceMode"] });
    if (build.commitUrl) result.push({ provider: "github", kind: "commit", label: `View commit ${build.commitSha.slice(0, 7)}`, externalId: build.commitSha, status: "succeeded", artifactUrl: build.commitUrl, completedAt: input.action?.updatedAt, sourceMode: build.sourceMode as ProviderActivity["sourceMode"] });
    if (repository) result.push({ provider: "github", kind: "checks", label: `Watch GitHub Actions · ${build.featureId}`, externalId: build.commitSha, status: input.previewEvaluations.some((item) => item.featureId === build.featureId) ? "succeeded" : "running", dashboardUrl: `https://github.com/${repository}/actions`, sourceMode: build.sourceMode as ProviderActivity["sourceMode"] });
    result.push({ provider: "vercel", kind: "preview", label: `Open product preview · ${build.featureId}`, externalId: build.externalDeploymentId ?? build.deploymentId, status: "succeeded", artifactUrl: build.deploymentUrl, startedAt: build.createdAt, completedAt: input.action?.updatedAt, sourceMode: build.sourceMode as ProviderActivity["sourceMode"] });
  }
  const posthogUrl = process.env.POSTHOG_PROJECT_URL;
  result.push({ provider: "posthog", kind: "analytics", label: "View PostHog activity", status: posthogUrl ? "succeeded" : "unavailable", dashboardUrl: posthogUrl, error: posthogUrl ? undefined : "A safe PostHog project URL is not configured." });
  const supabaseUrl = process.env.SUPABASE_DASHBOARD_URL;
  result.push({ provider: "supabase", kind: "record", label: "Inspect persisted Supabase record", status: supabaseUrl ? "succeeded" : "unavailable", dashboardUrl: supabaseUrl, error: supabaseUrl ? undefined : "A safe Supabase dashboard URL is not configured." });
  return result;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const actions = await readActions();
    const stored = await readArtifact<{ sessionId?: string; workflowInstanceId?: string; activeActionId?: string; workflow?: { phase?: string; revision?: number; history?: Array<{ id: string; at: string; from: string | null; to: string; actor: string; reason: string; entityIds: string[] }>; featureId?: string }; featureTitle?: string; sourceMode?: string; recommendations?: Array<{ id: string; title: string; score: number; confidence: number; problem: string }>; agentReasoning?: Record<string, { model: string; summary: string; sourceMode: string }>; handoffThread?: { messages?: Array<{ url: string; provider: string; sourceMode: string }> }; handoffFanout?: { channels?: Record<string, { messages?: Array<{ url: string; provider: string; sourceMode: string }> }> } }>("workflow");
    const cookieSession = request.headers.get("cookie")?.match(/(?:^|;\s*)dailycart_demo_session=([^;]+)/)?.[1];
    const activeAction = stored?.activeActionId
      ? await getAction(stored.activeActionId)
      : latestAction(actions, stored?.sessionId ?? cookieSession) ?? latestAction(actions);
    if (!stored && !activeAction) throw new Error("No workflow or action");
    const workflow = stored?.workflow;
    const last = workflow?.history?.at(-1);
    const [previews, previewEval, sync, demoState, reviews] = await Promise.all([
      readArtifact<{ builds?: Build[] }>("workflowPreview"),
      readArtifact<{ evaluations?: Array<{ featureId: string; targetUrl: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; detail: string }>; sourceMode: string; evaluatedAt: string }>; allPassed?: boolean; errorCode?: string; errorDetail?: string }>("workflowPreviewEval"),
      readArtifact<Sync>("workflowSync"),
      readArtifact<{ runs?: Array<{ id: string; agent: string; status: string; skillId?: string; skillVersion?: string; citedEvidenceIds?: string[]; reasoningSummary?: string; latencyMs: number; costUsd: number; retries: number; traceId?: string }>; approvals?: Array<{ id: string; stage: string; status: string; rationale?: string }>; campaigns?: Array<{ id: string; weightedScore: number; releaseAllowed: boolean }>; deployments?: Array<{ id: string; status: string; url?: string }> }>("demoState"),
      readArtifact<{ agentEvals?: Array<{ runId: string; criterion: string; score: number; passed: boolean; rationale: string; mode: string }>; recommendations?: Array<{ id: string; title: string; risks?: string[]; evidenceIds?: string[] }>; uxReview?: unknown; feasibilityReview?: unknown }>("workflowReviews")
    ]);
    const durablePhase = activeAction && ["queued", "running", "waiting_human", "failed"].includes(activeAction.status) ? activeAction.phase : workflow?.phase ?? "not_started";
    const allPassed = Boolean(previewEval?.allPassed);
    const sessionId = stored?.sessionId ?? activeAction?.sessionId ?? cookieSession ?? "SESSION-LEGACY";
    const presentation = await getPresentation(sessionId, durablePhase);
    const activities = providerActivity({ sync, builds: previews?.builds ?? [], action: activeAction, previewEvaluations: previewEval?.evaluations ?? [] });
    const runningStep = activeAction?.steps.find((step) => step.status === "running") ?? activeAction?.steps.at(-1);
    const latestRun = demoState?.runs?.find((run) => runningStep?.relatedRunIds?.includes(run.id)) ?? demoState?.runs?.at(-1);
    const activeAgent = runningStep || latestRun ? {
      role: runningStep?.agent ?? latestRun?.agent ?? last?.actor ?? "operator",
      skillId: runningStep?.skillId ?? latestRun?.skillId,
      skillVersion: latestRun?.skillVersion,
      runId: latestRun?.id,
      task: runningStep?.label ?? activeAction?.message ?? "Inspecting workflow state",
      evidenceIds: latestRun?.citedEvidenceIds ?? [],
      reasoningSummary: latestRun?.reasoningSummary ?? Object.values(stored?.agentReasoning ?? {})[0]?.summary,
      model: Object.values(stored?.agentReasoning ?? {})[0]?.model,
      latencyMs: latestRun?.latencyMs ?? 0,
      costUsd: latestRun?.costUsd ?? 0,
      status: runningStep?.status ?? latestRun?.status ?? "running",
      evaluations: (reviews?.agentEvals ?? []).filter((item) => item.runId === latestRun?.id)
    } : undefined;
    const availableActions = activeAction?.status === "failed"
      ? [{ command: "retry", label: "Retry failed step", enabled: true }]
      : durablePhase === "awaiting_feature_approval"
        ? [{ command: "approve_feature", label: "Approve feature tracks", enabled: true }]
        : durablePhase === "awaiting_release_approval" && allPassed
          ? [{ command: "approve_release", label: "Approve release", enabled: true }]
          : durablePhase === "released"
            ? []
            : !activeAction || activeAction.status === "succeeded"
              ? [{ command: "analyze", label: "Analyze opportunities", enabled: !workflow }]
              : [];
    return NextResponse.json({
      started: Boolean(workflow || activeAction),
      sessionId,
      workflowId: stored?.workflowInstanceId ?? activeAction?.workflowId ?? workflow?.featureId,
      operator: { required: configuredOperatorPasscode(), authorized: await isOperatorAuthorized() },
      featureId: workflow?.featureId,
      featureTitle: stored?.featureTitle,
      phase: durablePhase,
      revision: workflow?.revision ?? 0,
      sourceMode: stored?.sourceMode ?? process.env.INTEGRATION_MODE ?? "mock",
      currentAgent: last?.actor ?? "operator",
      nextAction: activeAction?.nextAction ?? (workflow?.phase === "awaiting_release_approval" ? "Human release approval is required." : workflow?.phase === "ready_to_release" ? "Deploy the approved release and sync provider records." : workflow?.phase === "released" ? "Observe product telemetry and incident feedback." : "Start the workflow from Company data."),
      activeAction,
      availableActions,
      previews: previews?.builds ?? [],
      previewEvaluations: previewEval?.evaluations ?? [],
      previewAllPassed: allPassed,
      previewError: previewEval?.errorCode ? { code: previewEval.errorCode, detail: previewEval.errorDetail } : undefined,
      providerRecords: sync ?? { ticketRecords: [], errors: [] },
      providerActivity: activities,
      presentation,
      activeAgent,
      phaseSummary: {
        completed: activeAction?.steps.filter((step) => step.status === "succeeded").map((step) => step.label) ?? [],
        running: runningStep?.label,
        inspect: presentation.currentStep,
        next: presentation.nextStep
      },
      approvalPacket: durablePhase === "awaiting_feature_approval" ? {
        kind: "feature", evidenceCount: stored?.recommendations?.reduce((sum, item) => sum + ("evidenceIds" in item && Array.isArray(item.evidenceIds) ? item.evidenceIds.length : 0), 0) ?? 0,
        agents: demoState?.runs?.slice(0, 6).map((run) => ({ runId: run.id, role: run.agent, skillId: run.skillId, status: run.status })) ?? [], recommendations: stored?.recommendations ?? [],
        agentEvals: reviews?.agentEvals ?? [], risks: (reviews?.recommendations ?? []).flatMap((item) => item.risks ?? [])
      } : durablePhase === "awaiting_release_approval" || durablePhase === "released" ? {
        kind: "release", builds: previews?.builds ?? [], evaluations: previewEval?.evaluations ?? [], providers: activities, errors: sync?.errors ?? []
      } : undefined,
      completionSummary: durablePhase === "released" ? {
        sessionId, workflowId: stored?.workflowInstanceId ?? activeAction?.workflowId ?? "WORKFLOW-LEGACY", startedAt: activeAction?.createdAt, completedAt: activeAction?.updatedAt,
        durationMs: activeAction ? Math.max(0, Date.parse(activeAction.updatedAt) - Date.parse(activeAction.createdAt)) : 0,
        agents: (demoState?.runs ?? []).map((run) => ({ runId: run.id, role: run.agent, skillId: run.skillId, status: run.status, latencyMs: run.latencyMs, costUsd: run.costUsd })),
        decisions: (demoState?.approvals ?? []).map((approval) => ({ id: approval.id, stage: approval.stage, status: approval.status, rationale: approval.rationale })),
        builds: (previews?.builds ?? []).map((build) => ({ featureId: build.featureId, commitSha: build.commitSha, previewUrl: build.deploymentUrl, pullRequestUrl: build.pullRequestUrl })),
        evals: (previewEval?.evaluations ?? []).map((evaluation) => ({ featureId: evaluation.featureId, score: evaluation.score, passed: evaluation.passed, targetUrl: evaluation.targetUrl })),
        providerActions: activities,
        telemetry: { totalCostUsd: (demoState?.runs ?? []).reduce((sum, run) => sum + run.costUsd, 0), totalLatencyMs: (demoState?.runs ?? []).reduce((sum, run) => sum + run.latencyMs, 0), retries: (demoState?.runs ?? []).reduce((sum, run) => sum + run.retries, 0) },
        warnings: [...(sync?.errors ?? []), ...activities.filter((item) => item.status === "failed").map((item) => item.error ?? `${item.provider} failed`)]
      } : undefined,
      recommendations: stored?.recommendations ?? [],
      reasoning: Object.values(stored?.agentReasoning ?? {})[0],
      agentReasoning: stored?.agentReasoning ?? {},
      links: [...(stored?.handoffThread?.messages ?? []).map((message, index) => ({ label: `${message.provider} delivery handoff ${index + 1}`, url: message.url, sourceMode: message.sourceMode })), ...Object.entries(stored?.handoffFanout?.channels ?? {}).flatMap(([purpose, result]) => (result.messages ?? []).slice(0, 1).map((message) => ({ label: `Slack ${purpose}`, url: message.url, sourceMode: message.sourceMode })))],
      history: workflow?.history ?? []
    });
  } catch {
    return NextResponse.json({ started: false, operator: { required: configuredOperatorPasscode(), authorized: await isOperatorAuthorized() }, phase: "not_started", revision: 0, sourceMode: process.env.INTEGRATION_MODE ?? "mock", currentAgent: "operator", nextAction: "Start the workflow from Company data.", history: [] });
  }
}
