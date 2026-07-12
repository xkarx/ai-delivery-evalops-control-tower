import { NextResponse } from "next/server";
import { getAction } from "@/lib/workflow-actions";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { executeWorkflowActionDirect } from "@/lib/workflow-action-executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_request: Request, context: { params: Promise<{ actionId: string }> }): Promise<Response> {
  const { actionId } = await context.params;
  const action = await getAction(actionId);
  return action ? NextResponse.json({ ok: true, action }) : NextResponse.json({ ok: false, message: "Workflow action was not found." }, { status: 404 });
}

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }): Promise<Response> {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const { actionId } = await context.params;
  const action = await getAction(actionId);
  if (!action) return NextResponse.json({ ok: false, code: "ACTION_NOT_FOUND", message: "Workflow action was not found." }, { status: 404 });
  if (["waiting_human", "succeeded", "failed"].includes(action.status)) return NextResponse.json({ ok: true, reused: true, action });
  if (action.status === "running" && Date.now() - Date.parse(action.heartbeatAt) < 45_000) {
    return NextResponse.json({ ok: true, reused: true, action }, { status: 202 });
  }
  try {
    const result = await executeWorkflowActionDirect(request, { actionId: action.actionId, sessionId: action.sessionId, workflowId: action.workflowId, command: action.command });
    return NextResponse.json({ ok: true, action: result });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "WORKFLOW_EXECUTION_FAILED", message: "Workflow execution failed.", detail: error instanceof Error ? error.message : "Unexpected workflow failure." }, { status: 500 });
  }
}
