import { DeliveryWorkflow } from "@dailycart/workflow";
import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { createConnectorSuite } from "@dailycart/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const denied = await requireOperatorAccess();
    if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({})) as { reviewer?: string; rationale?: string };
    const previewEval = await readArtifact<{ passed?: boolean; allPassed?: boolean }>("workflowPreviewEval");
    if (!previewEval?.allPassed && !previewEval?.passed) throw new Error("Run the preview evaluation successfully for every feature before approving the release.");
    const preview = await readArtifact<{ builds?: Array<{ featureId: string; commitSha: string; deploymentUrl: string }> }>("workflowPreview");
    if (!preview?.builds?.length) throw new Error("Two current preview builds are required before release approval.");
    for (const build of preview.builds) {
      const checks = await createConnectorSuite({ env: process.env }).codeHost.listChecks(build.commitSha);
      if (!checks.length || checks.some((check) => check.status !== "completed" || check.conclusion !== "success")) throw new Error(`${build.featureId} is waiting for successful GitHub checks on ${build.commitSha.slice(0, 7)}.`);
    }
    const providerSync = await readArtifact<{ ticketRecords?: unknown[]; notification?: unknown; trace?: unknown; workflowEvent?: unknown; errors?: string[] }>("workflowSync");
    if (process.env.INTEGRATION_MODE === "live" && (!providerSync?.ticketRecords?.length || !providerSync.notification || !providerSync.trace || !providerSync.workflowEvent || providerSync.errors?.length)) throw new Error("Verified Linear, Slack, Langfuse, Supabase, and Inngest references are required before release approval.");
    const reviewer = body.reviewer?.trim() || "operator";
    const rationale = body.rationale?.trim() || "Human release approval granted after the corrected evaluation passed.";
    const stored = await readArtifact<{ workflow: Parameters<typeof DeliveryWorkflow.hydrate>[0]; releaseApprovalId: string; featureId: string; featureTracks?: Array<{ releaseApprovalId: string }> }>("workflow");
    if (!stored) throw new Error("No active workflow was found.");
    const workflow = DeliveryWorkflow.hydrate(stored.workflow);
    const snapshot = workflow.resumeWithHumanDecision({ approvalId: stored.releaseApprovalId, status: "approved", reviewer, rationale, resolvedAt: new Date().toISOString() });
    const database = createConnectorSuite({ env: process.env }).database; const resolvedAt = new Date().toISOString();
    await database.upsert("approvals", { id: stored.releaseApprovalId, run_id: "RUN-0101", stage: "release", status: "approved", reviewer, rationale, requested_at: resolvedAt, resolved_at: resolvedAt }, "id");
    const data = await loadDemoState();
    const next: DemoState = {
      ...data,
      approvals: data.approvals.map((approval) => [stored.releaseApprovalId, ...(stored.featureTracks ?? []).map((track) => track.releaseApprovalId)].includes(approval.id) ? { ...approval, status: "approved" as const, reviewer, rationale, resolvedAt: new Date().toISOString() } : approval),
      activity: [{ at: new Date().toISOString(), type: "approval", title: "Release approval recorded", detail: `${stored.releaseApprovalId} approved by ${reviewer}; deployment is now ready.`, entityId: stored.releaseApprovalId }, ...data.activity]
    };
    const validated = assertDemoState(next);
    await writeArtifact("demoState", validated);
    await writeArtifact("workflow", { ...stored, phase: snapshot.phase, workflow: snapshot, approvedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, workflow: snapshot });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Release approval could not be recorded.", detail: error instanceof Error ? error.message : "Invalid workflow state." }, { status: 400 });
  }
}
