import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeliveryWorkflow } from "@dailycart/workflow";
import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const root = path.resolve(process.cwd(), "../..");
  const workflowPath = path.resolve(root, "artifacts/workflow-run.json");
  try {
    const body = await request.json().catch(() => ({})) as { reviewer?: string; rationale?: string };
    const previewEval = await readFile(path.resolve(root, "artifacts/workflow-preview-eval.json"), "utf8").then((value) => JSON.parse(value) as { passed?: boolean }).catch(() => undefined);
    if (!previewEval?.passed) throw new Error("Run the preview evaluation successfully before approving the release.");
    const reviewer = body.reviewer?.trim() || "operator";
    const rationale = body.rationale?.trim() || "Human release approval granted after the corrected evaluation passed.";
    const stored = JSON.parse(await readFile(workflowPath, "utf8")) as { workflow: Parameters<typeof DeliveryWorkflow.hydrate>[0]; releaseApprovalId: string; featureId: string };
    const workflow = DeliveryWorkflow.hydrate(stored.workflow);
    const snapshot = workflow.resumeWithHumanDecision({ approvalId: stored.releaseApprovalId, status: "approved", reviewer, rationale, resolvedAt: new Date().toISOString() });
    const data = await loadDemoState();
    const next: DemoState = {
      ...data,
      approvals: data.approvals.map((approval) => approval.id === stored.releaseApprovalId ? { ...approval, status: "approved" as const, reviewer, rationale, resolvedAt: new Date().toISOString() } : approval),
      activity: [{ at: new Date().toISOString(), type: "approval", title: "Release approval recorded", detail: `${stored.releaseApprovalId} approved by ${reviewer}; deployment is now ready.`, entityId: stored.releaseApprovalId }, ...data.activity]
    };
    const validated = assertDemoState(next);
    await writeFile(path.resolve(root, "artifacts/demo-state.json"), `${JSON.stringify(validated, null, 2)}\n`);
    await writeFile(workflowPath, `${JSON.stringify({ ...stored, phase: snapshot.phase, workflow: snapshot, approvedAt: new Date().toISOString() }, null, 2)}\n`);
    return NextResponse.json({ ok: true, workflow: snapshot });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Release approval could not be recorded.", detail: error instanceof Error ? error.message : "Invalid workflow state." }, { status: 400 });
  }
}
