import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { persistStructuredRecord } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const response = await fetch(new URL("/api/workflow/run", request.url), { method: "POST", headers: { "x-dailycart-feature-approved": "true", cookie: request.headers.get("cookie") ?? "" } });
  const payload = await response.json() as { ok?: boolean; workflow?: { featureId?: string; featureTitle?: string; featureBatchId?: string } };
  if (response.ok && payload.ok && payload.workflow?.featureId) {
    const at = new Date().toISOString();
    await persistStructuredRecord("features", payload.workflow.featureId, { title: payload.workflow.featureTitle, featureBatchId: payload.workflow.featureBatchId, sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "mocked" });
    await persistStructuredRecord("workflow_runs", "RUN-0100", { workflowType: "agent:pm", status: "succeeded", featureId: payload.workflow.featureId, phase: "feature_approved", humanApprovalId: "APR-0101", updatedAt: at });
    await persistStructuredRecord("approvals", "APR-0101", { runId: "RUN-0100", stage: "feature", status: "approved", reviewer: "operator", rationale: "Evidence and specialist reviews accepted for delivery planning.", requestedAt: at, resolvedAt: at });
  }
  return NextResponse.json(payload, { status: response.status });
}
