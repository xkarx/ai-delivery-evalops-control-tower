import { NextResponse } from "next/server";
import { workflowCommandSchema } from "@dailycart/schemas";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { createWorkflowAction, latestAction, newSessionId, newWorkflowId, readActions, updateAction } from "@/lib/workflow-actions";
import { inngest } from "@/lib/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredWorkflow = { sessionId?: string; workflowInstanceId?: string; activeActionId?: string; workflow?: { revision?: number } } & Record<string, unknown>;

async function localRoute(request: Request, path: string, init: RequestInit = {}, identity?: { sessionId: string; workflowId: string; actionId: string }): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path, request.url), { ...init, headers: { "content-type": "application/json", ...(identity ? { "x-dailycart-session-id": identity.sessionId, "x-dailycart-workflow-id": identity.workflowId, "x-dailycart-action-id": identity.actionId } : {}), ...(init.headers as Record<string, string> | undefined), cookie: request.headers.get("cookie") ?? "" } });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) throw new Error(String(payload.detail ?? payload.message ?? `${path} failed.`));
  return payload;
}

async function executeDeterministicAction(request: Request, actionId: string, sessionId: string, workflowId: string, command: "analyze" | "approve_feature" | "approve_release" | "retry" | "declare_incident"): Promise<void> {
  const identity = { sessionId, workflowId, actionId };
  await updateAction(actionId, { status: "running", attempts: 1, phase: "running", progress: 10, message: "Executing deterministic workflow contracts.", nextAction: "Follow the execution timeline." });
  if (command === "analyze") {
    await localRoute(request, "/api/workflow/run", { method: "POST" }, identity);
    await updateAction(actionId, { status: "waiting_human", phase: "awaiting_feature_approval", progress: 100, message: "Opportunity analysis is ready for human feature approval.", nextAction: "Approve the selected feature tracks." });
    return;
  }
  if (command === "approve_feature" || command === "retry") {
    await localRoute(request, "/api/workflow/run", { method: "POST", headers: { "x-dailycart-feature-approved": "true" } }, identity);
    await localRoute(request, "/api/workflow/sync", { method: "POST" }, identity);
    await localRoute(request, "/api/workflow/preview", { method: "POST", body: JSON.stringify({ reconcile: true }) }, identity);
    const evaluation = await localRoute(request, "/api/workflow/preview-eval", { method: "POST", body: JSON.stringify({ rerun: true }) }, identity);
    if (!evaluation.allPassed) throw new Error(String(evaluation.detail ?? "Preview evaluation blocked release."));
    await updateAction(actionId, { status: "waiting_human", phase: "awaiting_release_approval", progress: 100, message: "All deterministic preview checks passed. Human release approval is required.", nextAction: "Approve the release." });
    return;
  }
  if (command === "approve_release") {
    await localRoute(request, "/api/workflow/approve", { method: "POST", body: JSON.stringify({ reviewer: "operator", rationale: "Approved after preview checks passed." }) }, identity);
    await localRoute(request, "/api/workflow/deploy", { method: "POST" }, identity);
    await updateAction(actionId, { status: "succeeded", phase: "released", progress: 100, message: "The deterministic release completed.", nextAction: "Observe product analytics." });
    return;
  }
  throw new Error(`Command ${command} is not available in deterministic mode.`);
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({})) as { command?: string; sessionId?: string; rationale?: string };
    const command = workflowCommandSchema.parse(body.command ?? "analyze");
    const workflow = await readArtifact<StoredWorkflow>("workflow");
    const cookieSession = request.headers.get("cookie")?.match(/(?:^|;\s*)dailycart_demo_session=([^;]+)/)?.[1];
    const sessionId = body.sessionId ?? workflow?.sessionId ?? cookieSession ?? newSessionId();
    const workflowId = workflow?.workflowInstanceId ?? newWorkflowId();
    const actions = await readActions();
    const active = latestAction(actions, sessionId);
    if (active && ["queued", "running"].includes(active.status)) {
      return NextResponse.json({ ok: true, reused: true, actionId: active.actionId, sessionId, workflowId, status: active.status, statusUrl: `/api/workflow/actions/${active.actionId}` }, { status: 202 });
    }
    const revision = (workflow?.workflow?.revision ?? 0) + (command === "retry" ? (active?.attempts ?? 0) + 1 : 0);
    const { action, reused } = await createWorkflowAction({ command, sessionId, workflowId, revision });
    if (workflow) await writeArtifact("workflow", { ...workflow, sessionId, workflowInstanceId: workflowId, activeActionId: action.actionId });
    if (!reused) {
      if (process.env.INTEGRATION_MODE === "live") await inngest.send({ id: action.actionId, name: "dailycart/workflow.action.requested", data: { actionId: action.actionId, sessionId, workflowId, command, rationale: body.rationale } });
      else {
        await executeDeterministicAction(request, action.actionId, sessionId, workflowId, command);
        const completedWorkflow = await readArtifact<StoredWorkflow>("workflow");
        if (completedWorkflow) await writeArtifact("workflow", { ...completedWorkflow, sessionId, workflowInstanceId: workflowId, activeActionId: action.actionId });
      }
    }
    return NextResponse.json({ ok: true, reused, actionId: action.actionId, sessionId, workflowId, status: action.status, statusUrl: `/api/workflow/actions/${action.actionId}` }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Workflow action could not be queued.", detail: error instanceof Error ? error.message : "Invalid workflow command." }, { status: 400 });
  }
}
