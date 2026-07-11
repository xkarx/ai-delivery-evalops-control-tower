import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { DeliveryWorkflow } from "@dailycart/workflow";
import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const root = path.resolve(process.cwd(), "../..");
  const workflowPath = path.resolve(root, "artifacts/workflow-run.json");
  try {
    const stored = JSON.parse(await readFile(workflowPath, "utf8")) as { workflow: Parameters<typeof DeliveryWorkflow.hydrate>[0]; featureId: string };
    const previewEval = await readFile(path.resolve(root, "artifacts/workflow-preview-eval.json"), "utf8").then((value) => JSON.parse(value) as { passed?: boolean }).catch(() => undefined);
    if (!previewEval?.passed) throw new Error("Production deployment is gated on a passing preview evaluation.");
    const workflow = DeliveryWorkflow.hydrate(stored.workflow);
    if (workflow.snapshot().phase !== "ready_to_release") throw new Error(`Release must be approved first; current phase is ${workflow.snapshot().phase}.`);
    const deployment = await createConnectorSuite({ env: process.env }).deployment.deploy({ id: "DEP-0101", featureId: stored.featureId, environment: "production", commitSha: process.env.GITHUB_COMMIT_SHA ?? "agent/live-cohesion", repository: process.env.GITHUB_DEFAULT_REPOSITORY, ref: process.env.GITHUB_DEFAULT_BRANCH ?? "main" });
    const snapshot = workflow.markReleased(deployment.deployment.id, "release-agent");
    const data = await loadDemoState();
    const next: DemoState = { ...data, deployments: [...data.deployments.filter((item) => item.id !== deployment.deployment.id), deployment.deployment], activity: [{ at: new Date().toISOString(), type: "deployment", title: "Live deployment recorded", detail: `${deployment.deployment.id} · ${deployment.sourceMode} provider action`, entityId: deployment.deployment.id }, ...data.activity] };
    await writeFile(path.resolve(root, "artifacts/demo-state.json"), `${JSON.stringify(assertDemoState(next), null, 2)}\n`);
    await writeFile(workflowPath, `${JSON.stringify({ ...stored, phase: snapshot.phase, workflow: snapshot, deployment }, null, 2)}\n`);
    return NextResponse.json({ ok: true, deployment, workflow: snapshot });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Deployment failed.";
    return NextResponse.json({ ok: false, message: "Deployment was not recorded.", detail }, { status: 502 });
  }
}
