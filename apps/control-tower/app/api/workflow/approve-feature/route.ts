import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { createConnectorSuite } from "@dailycart/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const response = await fetch(new URL("/api/workflow/run", request.url), { method: "POST", headers: { "x-dailycart-feature-approved": "true", cookie: request.headers.get("cookie") ?? "" } });
  const payload = await response.json() as { ok?: boolean; workflow?: { featureId?: string; featureTitle?: string; featureBatchId?: string } };
  if (response.ok && payload.ok && payload.workflow?.featureId) {
    const database = createConnectorSuite({ env: process.env }).database; const at = new Date().toISOString();
    await database.upsert("entities", { id: payload.workflow.featureId, entity_type: "feature", title: payload.workflow.featureTitle ?? payload.workflow.featureId, source_mode: process.env.INTEGRATION_MODE === "live" ? "live" : "mocked", payload: { featureBatchId: payload.workflow.featureBatchId }, updated_at: at }, "id");
    await database.upsert("workflow_runs", { id: "RUN-0100", workflow_type: "agent:pm", status: "succeeded", feature_id: payload.workflow.featureId, state: { phase: "feature_approved", humanApprovalId: "APR-0101" }, source_mode: process.env.INTEGRATION_MODE === "live" ? "live" : "mocked", updated_at: at }, "id");
    await database.upsert("approvals", { id: "APR-0101", run_id: "RUN-0100", stage: "feature", status: "approved", reviewer: "operator", rationale: "Evidence and specialist reviews accepted for delivery planning.", requested_at: at, resolved_at: at }, "id");
  }
  return NextResponse.json(payload, { status: response.status });
}
