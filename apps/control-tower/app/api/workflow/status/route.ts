import { NextResponse } from "next/server";
import { configuredOperatorPasscode, isOperatorAuthorized } from "@/lib/operator-auth";
import { readArtifact } from "@/lib/durable-artifacts";
import { getAction, latestAction, readActions } from "@/lib/workflow-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const [previews, previewEval, sync] = await Promise.all([
      readArtifact<{ builds?: Array<{ featureId: string; deploymentUrl: string; commitSha: string; pullRequestUrl: string; sourceMode: string }> }>("workflowPreview"),
      readArtifact<{ evaluations?: Array<{ featureId: string; targetUrl: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; detail: string }>; sourceMode: string; evaluatedAt: string }>; allPassed?: boolean; errorCode?: string; errorDetail?: string }>("workflowPreviewEval"),
      readArtifact<{ ticketRecords?: Array<{ identifier: string; url: string; sourceMode: string }>; notification?: { url: string; sourceMode: string }; trace?: { url: string; sourceMode: string }; workflowEvent?: { url: string; sourceMode: string }; errors?: string[] }>("workflowSync")
    ]);
    const durablePhase = activeAction && ["queued", "running", "waiting_human", "failed"].includes(activeAction.status) ? activeAction.phase : workflow?.phase ?? "not_started";
    const allPassed = Boolean(previewEval?.allPassed);
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
      sessionId: stored?.sessionId ?? activeAction?.sessionId,
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
