import { NextResponse } from "next/server";
import { workflowCommandSchema } from "@dailycart/schemas";
import { requireOperatorOrWorkflowService } from "@/lib/operator-auth";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { createWorkflowAction, latestAction, newWorkflowId, readActions, updateAction } from "@/lib/workflow-actions";
import { inngest } from "@/lib/inngest/client";
import { createDemoSession, demoSessionCookie, encodeSessionCookie, executionModeSchema, getDemoSession, requestSessionId } from "@/lib/demo-session";
import { phaseForNewCommand, shouldReconcileHumanGateAction, shouldReuseBusyAction } from "@/lib/workflow-human-gates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredWorkflow = { sessionId?: string; workflowInstanceId?: string; activeActionId?: string; featureId?: string; workflow?: { revision?: number; phase?: string } } & Record<string, unknown>;

function validateCommand(command: string, phase: string | undefined, latestStatus?: string): void {
  if (command === "analyze" && phase && phase !== "not_started") throw new Error(`Analysis cannot start while the workflow is ${phase}. Start a new demo to run another analysis.`);
  if (command === "approve_feature" && phase !== "awaiting_feature_approval") throw new Error("Feature approval is only available at the feature-approval gate.");
  if (command === "approve_release" && phase !== "awaiting_release_approval") throw new Error("Release approval is only available after both current preview evaluations pass.");
  if (command === "retry" && latestStatus !== "failed") throw new Error("Retry is only available after a recorded workflow failure.");
  if (command === "declare_incident" && !["released", "product_outcomes"].includes(phase ?? "")) throw new Error("An incident can be declared only after this session has a production release.");
}

async function localRoute(request: Request, path: string, init: RequestInit = {}, identity?: { sessionId: string; workflowId: string; actionId: string; executionMode?: "showcase" | "full_verification" }): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path, request.url), { ...init, headers: { "content-type": "application/json", ...(identity ? { "x-dailycart-session-id": identity.sessionId, "x-dailycart-workflow-id": identity.workflowId, "x-dailycart-action-id": identity.actionId } : {}), ...(init.headers as Record<string, string> | undefined), cookie: request.headers.get("cookie") ?? "" } });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) throw new Error(String(payload.detail ?? payload.message ?? `${path} failed.`));
  return payload;
}

async function executeDeterministicAction(request: Request, actionId: string, sessionId: string, workflowId: string, command: "analyze" | "approve_feature" | "approve_release" | "retry" | "declare_incident"): Promise<void> {
  const identity = { sessionId, workflowId, actionId, executionMode: (await getDemoSession(sessionId))?.executionMode };
  await updateAction(actionId, { status: "running", attempts: 1, phase: "running", progress: 10, message: "Executing deterministic workflow contracts.", nextAction: "Follow the execution timeline." }, sessionId);
  if (command === "analyze") {
  await localRoute(request, "/api/workflow/run", { method: "POST", headers: { "x-dailycart-execution-mode": identity.executionMode ?? "showcase" } }, identity);
    await updateAction(actionId, { status: "waiting_human", phase: "awaiting_feature_approval", progress: 100, message: "Opportunity analysis is ready for human feature approval.", nextAction: "Approve the selected feature tracks." }, sessionId);
    return;
  }
  if (command === "approve_feature" || command === "retry") {
    await localRoute(request, "/api/workflow/run", { method: "POST", headers: { "x-dailycart-feature-approved": "true", "x-dailycart-execution-mode": identity.executionMode ?? "showcase" } }, identity);
    await localRoute(request, "/api/workflow/sync", { method: "POST" }, identity);
    await localRoute(request, "/api/workflow/preview", { method: "POST", body: JSON.stringify({ reconcile: true }) }, identity);
    const evaluation = await localRoute(request, "/api/workflow/preview-eval", { method: "POST", body: JSON.stringify({ rerun: true }) }, identity);
    if (!evaluation.allPassed) throw new Error(String(evaluation.detail ?? "Preview evaluation blocked release."));
    await updateAction(actionId, { status: "waiting_human", phase: "awaiting_release_approval", progress: 100, message: "All deterministic preview checks passed. Human release approval is required.", nextAction: "Approve the release." }, sessionId);
    return;
  }
  if (command === "approve_release") {
    await localRoute(request, "/api/workflow/approve", { method: "POST", body: JSON.stringify({ reviewer: "operator", rationale: "Approved after preview checks passed." }) }, identity);
    await localRoute(request, "/api/workflow/deploy", { method: "POST" }, identity);
    await updateAction(actionId, { status: "succeeded", phase: "released", progress: 100, message: "The deterministic release completed.", nextAction: "Observe product analytics." }, sessionId);
    return;
  }
  if (command === "declare_incident") {
    const result = await localRoute(request, "/api/incidents", { method: "POST", body: JSON.stringify({ title: "Checkout recovery regression detected after release", rootCause: "Observed checkout recovery behavior no longer matches the approved release baseline.", severity: "SEV-3", featureId: "FEAT-0001" }) }, identity);
    await updateAction(actionId, { status: "succeeded", phase: "incident_learning", progress: 100, message: "The production signal became an incident and regression case.", nextAction: "Inspect lineage or start a new demo.", externalRefs: (result.externalRefs ?? []) as Array<{ provider: string; id: string; url?: string }> }, sessionId);
    return;
  }
  throw new Error(`Command ${command} is not available in deterministic mode.`);
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireOperatorOrWorkflowService(request);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({})) as { command?: string; sessionId?: string; featureId?: string; rationale?: string; executionMode?: string };
    const command = workflowCommandSchema.parse(body.command ?? "analyze");
    let sessionId = requestSessionId(request);
    let createdSession = false;
    if (!sessionId) { sessionId = (await createDemoSession(executionModeSchema.parse(body.executionMode ?? "showcase"))).sessionId; createdSession = true; }
    if (body.sessionId && body.sessionId !== sessionId) throw new Error("The requested workflow session does not match this browser session.");
    const workflow = await readArtifact<StoredWorkflow>("workflow", sessionId);
    const demoSession = await getDemoSession(sessionId);
    const workflowId = workflow?.workflowInstanceId ?? demoSession?.workflowId ?? newWorkflowId();
    const actions = await readActions(sessionId);
    let active = latestAction(actions, sessionId);
    const storedPhase = workflow?.workflow?.phase;
    if (shouldReconcileHumanGateAction(active, storedPhase)) {
      active = await updateAction(active.actionId, {
        status: "waiting_human",
        phase: storedPhase,
        progress: 100,
        message: storedPhase === "awaiting_feature_approval"
          ? "Opportunity analysis is ready for human feature approval."
          : "Preview checks are ready for human release approval.",
        nextAction: storedPhase === "awaiting_feature_approval"
          ? "Review and approve the selected feature tracks."
          : "Review the release packet and approve production release."
      }, sessionId);
    }
    if (active && shouldReuseBusyAction(active, command)) {
      const response = NextResponse.json({ ok: true, reused: true, actionId: active.actionId, sessionId, workflowId, status: active.status, statusUrl: `/api/workflow/actions/${active.actionId}` }, { status: 202 });
      if (createdSession) response.cookies.set(demoSessionCookie, encodeSessionCookie(sessionId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
      return response;
    }
    // The action record is authoritative while resumable work is active or
    // paused at a human gate. The workflow aggregate can lag behind it during
    // serverless persistence, especially after a refresh.
    const authoritativePhase = phaseForNewCommand(active, workflow?.workflow?.phase, command);
    validateCommand(command, authoritativePhase, active?.status);
    const revision = (workflow?.workflow?.revision ?? 0) + (command === "retry" ? (active?.attempts ?? 0) + 1 : 0);
    const executionMode = demoSession?.executionMode ?? executionModeSchema.parse(body.executionMode ?? "showcase");
    const { action, reused } = await createWorkflowAction({ command, sessionId, workflowId, revision, featureId: body.featureId ?? workflow?.featureId, executionMode, parentPhase: authoritativePhase });
    await writeArtifact("workflow", { ...(workflow ?? {}), sessionId, workflowInstanceId: workflowId, activeActionId: action.actionId }, sessionId);
    if (!reused) {
      if (process.env.INTEGRATION_MODE === "live") await inngest.send({ id: action.actionId, name: "dailycart/workflow.action.requested", data: { actionId: action.actionId, sessionId, workflowId, command, rationale: body.rationale, executionMode } });
      else {
        await executeDeterministicAction(request, action.actionId, sessionId, workflowId, command);
        const completedWorkflow = await readArtifact<StoredWorkflow>("workflow", sessionId);
        if (completedWorkflow) await writeArtifact("workflow", { ...completedWorkflow, sessionId, workflowInstanceId: workflowId, activeActionId: action.actionId }, sessionId);
      }
    }
    const response = NextResponse.json({ ok: true, reused, actionId: action.actionId, sessionId, workflowId, status: action.status, statusUrl: `/api/workflow/actions/${action.actionId}` }, { status: 202 });
    if (createdSession) response.cookies.set(demoSessionCookie, encodeSessionCookie(sessionId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Workflow action could not be queued.", detail: error instanceof Error ? error.message : "Invalid workflow command." }, { status: 400 });
  }
}
