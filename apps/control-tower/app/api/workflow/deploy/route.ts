import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { DeliveryWorkflow } from "@dailycart/workflow";
import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  const workflowPath = path.resolve(root, "artifacts/workflow-run.json");
  try {
    const stored = JSON.parse(await readFile(workflowPath, "utf8")) as { workflow: Parameters<typeof DeliveryWorkflow.hydrate>[0]; featureId: string; featureTracks?: Array<{ featureId: string }> };
    const previewEval = await readFile(path.resolve(root, "artifacts/workflow-preview-eval.json"), "utf8").then((value) => JSON.parse(value) as { passed?: boolean; allPassed?: boolean }).catch(() => undefined);
    if (!previewEval?.allPassed && !previewEval?.passed) throw new Error("Production deployment is gated on passing preview evaluations for every feature.");
    const workflow = DeliveryWorkflow.hydrate(stored.workflow);
    if (workflow.snapshot().phase !== "ready_to_release") throw new Error(`Release must be approved first; current phase is ${workflow.snapshot().phase}.`);
    const deploymentAdapter = createConnectorSuite({ env: process.env }).deployment;
    const features = stored.featureTracks?.length ? stored.featureTracks : [{ featureId: stored.featureId }];
    const deployments = await Promise.all(features.map((track, index) => deploymentAdapter.deploy({ id: `DEP-${String(101 + index).padStart(4, "0")}`, featureId: track.featureId, environment: "production", commitSha: process.env.GITHUB_COMMIT_SHA ?? "agent/live-cohesion", repository: process.env.GITHUB_DEFAULT_REPOSITORY, ref: process.env.GITHUB_DEFAULT_BRANCH ?? "main" })));
    const snapshot = workflow.markReleased(deployments[0]!.deployment.id, "release-agent");
    const data = await loadDemoState();
    const next: DemoState = { ...data, deployments: [...data.deployments.filter((item) => !deployments.some((record) => record.deployment.id === item.id)), ...deployments.map((record) => record.deployment)], activity: [...deployments.map((deployment) => ({ at: new Date().toISOString(), type: "deployment", title: "Production deployment recorded", detail: `${deployment.deployment.id} · ${deployment.sourceMode} provider action`, entityId: deployment.deployment.id })), ...data.activity] };
    await writeFile(path.resolve(root, "artifacts/demo-state.json"), `${JSON.stringify(assertDemoState(next), null, 2)}\n`);
    await writeFile(workflowPath, `${JSON.stringify({ ...stored, phase: snapshot.phase, workflow: snapshot, deployments }, null, 2)}\n`);
    return NextResponse.json({ ok: true, deployments, deployment: deployments[0], workflow: snapshot });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Deployment failed.";
    return NextResponse.json({ ok: false, message: "Deployment was not recorded.", detail }, { status: 502 });
  }
}
