import { DeliveryWorkflow } from "@dailycart/workflow";
import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { persistStructuredRecord, readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { createConnectorSuite } from "@dailycart/connectors";
import { requestSessionId } from "@/lib/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const denied = await requireOperatorAccess();
    if (denied) return denied;
  const sessionId = requestSessionId(request);
  if (!sessionId) return NextResponse.json({ ok: false, message: "An active demo session is required." }, { status: 409 });
  try {
    const body = await request.json().catch(() => ({})) as { reviewer?: string; rationale?: string };
    const previewEval = await readArtifact<{ passed?: boolean; allPassed?: boolean }>("workflowPreviewEval", sessionId);
    if (!previewEval?.allPassed && !previewEval?.passed) throw new Error("Run the preview evaluation successfully for every feature before approving the release.");
    const preview = await readArtifact<{ builds?: Array<{ featureId: string; commitSha: string; deploymentUrl: string; deploymentId: string; externalDeploymentId?: string }> }>("workflowPreview", sessionId);
    if (!preview?.builds?.length) throw new Error("Two current preview builds are required before release approval.");
    const suite = createConnectorSuite({ env: process.env });
    for (const build of preview.builds) {
      if (process.env.INTEGRATION_MODE === "live") {
        if (!build.externalDeploymentId) throw new Error(`${build.featureId} is missing its Vercel deployment identifier.`);
        const deployment = await suite.deployment.getDeployment(build.externalDeploymentId, { id: build.deploymentId, featureId: build.featureId, environment: "preview", commitSha: build.commitSha, repository: process.env.GITHUB_DEFAULT_REPOSITORY });
        if (!deployment || deployment.deployment.status !== "ready") throw new Error(`${build.featureId} preview is not READY in Vercel.`);
      }
      const checks = await suite.codeHost.listChecks(build.commitSha);
      if (!checks.length || checks.some((check) => check.status !== "completed" || check.conclusion !== "success")) throw new Error(`${build.featureId} is waiting for successful GitHub checks on ${build.commitSha.slice(0, 7)}.`);
    }
    const providerSync = await readArtifact<{ ticketRecords?: unknown[]; notification?: unknown; trace?: unknown; workflowEvent?: unknown; errors?: string[] }>("workflowSync", sessionId);
    if (process.env.INTEGRATION_MODE === "live" && (!providerSync?.ticketRecords?.length || !providerSync.notification || !providerSync.trace || !providerSync.workflowEvent || providerSync.errors?.length)) throw new Error("Verified Linear, Slack, Langfuse, Supabase, and Inngest references are required before release approval.");
    const reviewer = body.reviewer?.trim() || "operator";
    const rationale = body.rationale?.trim() || "Human release approval granted after the corrected evaluation passed.";
    const stored = await readArtifact<{ sessionId?: string; workflowInstanceId?: string; workflow: Parameters<typeof DeliveryWorkflow.hydrate>[0]; releaseApprovalId: string; featureId: string; featureTracks?: Array<{ releaseApprovalId: string }> }>("workflow", sessionId);
    if (!stored) throw new Error("No active workflow was found.");
    if (stored.sessionId && stored.sessionId !== sessionId) throw new Error("The workflow belongs to a different demo session.");
    const workflow = DeliveryWorkflow.hydrate(stored.workflow);
    const snapshot = workflow.resumeWithHumanDecision({ approvalId: stored.releaseApprovalId, status: "approved", reviewer, rationale, resolvedAt: new Date().toISOString() });
    const resolvedAt = new Date().toISOString();
    await persistStructuredRecord("approvals", stored.releaseApprovalId, { sessionId, workflowId: stored.workflowInstanceId, runId: stored.workflowInstanceId ?? stored.featureId, stage: "release", status: "approved", reviewer, rationale, requestedAt: resolvedAt, resolvedAt }, sessionId);
    const data = await loadDemoState(sessionId);
    const next: DemoState = {
      ...data,
      approvals: data.approvals.map((approval) => [stored.releaseApprovalId, ...(stored.featureTracks ?? []).map((track) => track.releaseApprovalId)].includes(approval.id) ? { ...approval, status: "approved" as const, reviewer, rationale, resolvedAt: new Date().toISOString() } : approval),
      activity: [{ at: new Date().toISOString(), type: "approval", title: "Release approval recorded", detail: `${stored.releaseApprovalId} approved by ${reviewer}; deployment is now ready.`, entityId: stored.releaseApprovalId }, ...data.activity]
    };
    const validated = assertDemoState(next);
    await writeArtifact("demoState", validated, sessionId);
    await writeArtifact("workflow", { ...stored, sessionId, phase: snapshot.phase, workflow: snapshot, approvedAt: new Date().toISOString() }, sessionId);
    return NextResponse.json({ ok: true, workflow: snapshot });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Release approval could not be recorded.", detail: error instanceof Error ? error.message : "Invalid workflow state." }, { status: 400 });
  }
}
