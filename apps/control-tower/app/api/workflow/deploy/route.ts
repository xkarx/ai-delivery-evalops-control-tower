import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { DeliveryWorkflow } from "@dailycart/workflow";
import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function mergeApprovedPullRequests(builds: Array<{ featureId: string; pullRequestId: string; commitSha: string }>): Promise<Map<string, string>> {
  const merged = new Map<string, string>();
  if (process.env.INTEGRATION_MODE !== "live") { for (const build of builds) merged.set(build.featureId, build.commitSha); return merged; }
  const repository = process.env.GITHUB_DEFAULT_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error("GitHub repository and token are required to merge approved feature PRs.");
  for (const build of builds) {
    const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${encodeURIComponent(build.pullRequestId)}/merge`, { method: "PUT", headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" }, body: JSON.stringify({ commit_title: `${build.featureId}: approved DailyCart release`, merge_method: "merge", sha: build.commitSha }) });
    const payload = await response.json() as { merged?: boolean; sha?: string; message?: string };
    if (!response.ok || !payload.merged || !payload.sha) throw new Error(`${build.featureId} PR merge failed: ${payload.message ?? `HTTP ${response.status}`}`);
    merged.set(build.featureId, payload.sha);
  }
  return merged;
}

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  try {
    const stored = await readArtifact<{ workflow: Parameters<typeof DeliveryWorkflow.hydrate>[0]; featureId: string; featureTracks?: Array<{ featureId: string }> }>("workflow");
    if (!stored) throw new Error("No active workflow was found.");
    const previewEval = await readArtifact<{ passed?: boolean; allPassed?: boolean }>("workflowPreviewEval");
    if (!previewEval?.allPassed && !previewEval?.passed) throw new Error("Production deployment is gated on passing preview evaluations for every feature.");
    const workflow = DeliveryWorkflow.hydrate(stored.workflow);
    if (workflow.snapshot().phase !== "ready_to_release") throw new Error(`Release must be approved first; current phase is ${workflow.snapshot().phase}.`);
    const suite = createConnectorSuite({ env: process.env });
    const deploymentAdapter = suite.deployment;
    const features = stored.featureTracks?.length ? stored.featureTracks : [{ featureId: stored.featureId }];
    const preview = await readArtifact<{ builds?: Array<{ featureId: string; pullRequestId: string; commitSha: string }> }>("workflowPreview");
    if (!preview?.builds?.length) throw new Error("Approved preview builds are missing.");
    const sync = await readArtifact<{ ticketRecords?: Array<{ externalId?: string; identifier: string; internalId: string }> }>("workflowSync");
    if (process.env.INTEGRATION_MODE === "live" && !sync?.ticketRecords?.length) throw new Error("Create and verify the Linear delivery records before production deployment.");
    const mergedCommits = await mergeApprovedPullRequests(preview.builds);
    const deployments = await Promise.all(features.map((track, index) => deploymentAdapter.deploy({ id: `DEP-${String(101 + index).padStart(4, "0")}`, featureId: track.featureId, environment: "production", commitSha: mergedCommits.get(track.featureId) ?? preview.builds?.find((build) => build.featureId === track.featureId)?.commitSha ?? "missing", repository: process.env.GITHUB_DEFAULT_REPOSITORY, ref: process.env.GITHUB_DEFAULT_BRANCH ?? "main" })));
    const completedTickets = [];
    for (const ticket of sync?.ticketRecords ?? []) completedTickets.push(await suite.issueTracker.updateTicketState(ticket.externalId ?? ticket.identifier, "done"));
    const releaseMessage = await suite.chat.postMessage({ channel: process.env.SLACK_DELIVERY_CHANNEL, text: `DailyCart release completed for ${features.map((feature) => feature.featureId).join(", ")}. Production deployments: ${deployments.map((record) => record.deployment.url).join(" · ")}`, metadata: { source: "dailycart-release", features: features.map((feature) => feature.featureId), deployments: deployments.map((record) => record.deployment.id) } });
    const snapshot = workflow.markReleased(deployments[0]!.deployment.id, "release-agent");
    const data = await loadDemoState();
    const next: DemoState = { ...data, deployments: [...data.deployments.filter((item) => !deployments.some((record) => record.deployment.id === item.id)), ...deployments.map((record) => record.deployment)], activity: [...deployments.map((deployment) => ({ at: new Date().toISOString(), type: "deployment", title: "Production deployment recorded", detail: `${deployment.deployment.id} · ${deployment.sourceMode} provider action`, entityId: deployment.deployment.id })), ...data.activity] };
    await writeArtifact("demoState", assertDemoState(next));
    await writeArtifact("workflow", { ...stored, phase: snapshot.phase, workflow: snapshot, deployments, releaseMessage, completedTickets });
    return NextResponse.json({ ok: true, deployments, deployment: deployments[0], releaseMessage, completedTickets, workflow: snapshot });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Deployment failed.";
    return NextResponse.json({ ok: false, message: "Deployment was not recorded.", detail }, { status: 502 });
  }
}
