import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PreviewBuild = { featureId: string; featureTitle?: string; branch: string; commitSha: string; commitUrl: string; pullRequestUrl: string; deploymentUrl: string; deploymentId: string; sourceMode: string; createdAt: string };

export async function POST(): Promise<Response> {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  const workflowPath = path.resolve(root, "artifacts/workflow-run.json");
  const buildPath = path.resolve(root, "artifacts/workflow-preview.json");
  try {
    const existing = await readFile(buildPath, "utf8").then((value) => JSON.parse(value) as { builds?: PreviewBuild[]; featureId?: string }).catch(() => undefined);
    if (existing?.builds?.length) return NextResponse.json({ ok: true, reused: true, build: existing.builds[0], builds: existing.builds });
    const workflow = JSON.parse(await readFile(workflowPath, "utf8")) as { featureId: string; featureTitle?: string; featureTracks?: Array<{ featureId: string; featureTitle: string }> };
    const tracks = workflow.featureTracks?.length ? workflow.featureTracks : [{ featureId: workflow.featureId, featureTitle: workflow.featureTitle ?? workflow.featureId }];
    const suite = createConnectorSuite({ env: process.env });
    const productPath = "apps/control-tower/app/product/product-client.tsx";
    const source = await readFile(path.resolve(root, productPath), "utf8");
    const builds: PreviewBuild[] = [];
    for (const track of tracks) {
      const branch = `agent/${track.featureId.toLowerCase()}-preview`;
      await suite.codeHost.createBranch({ name: branch });
      const marker = "Built for delivery experiments";
      const updated = source.includes(marker) ? source.replace(marker, `Live feature preview · ${track.featureId}`) : `${source}\n// DailyCart preview build ${track.featureId}\n`;
      const commit = await suite.codeHost.commitFile({ path: productPath, content: updated, message: `feat(${track.featureId.toLowerCase()}): build product preview`, branch });
      const pullRequest = await suite.codeHost.openPullRequest({ title: `${track.featureId}: product preview`, body: `Preview build for ${track.featureTitle}.\n\nFeature: ${track.featureId}\nBranch: ${branch}`, head: branch, base: process.env.GITHUB_DEFAULT_BRANCH ?? "main", draft: false, featureId: track.featureId });
      const deployment = await suite.deployment.deploy({ id: `DEP-${String(9000 + Number(track.featureId.replace(/\D/g, "") || "1")).padStart(4, "0")}`, featureId: track.featureId, environment: "preview", commitSha: commit.commitSha, repository: process.env.GITHUB_DEFAULT_REPOSITORY, ref: branch });
      builds.push({ featureId: track.featureId, featureTitle: track.featureTitle, branch, commitSha: commit.commitSha, commitUrl: commit.url, pullRequestUrl: pullRequest.url, deploymentUrl: deployment.deployment.url, deploymentId: deployment.deployment.id, sourceMode: deployment.sourceMode, createdAt: new Date().toISOString() });
    }
    await writeFile(buildPath, `${JSON.stringify({ builds }, null, 2)}\n`);
    await appendFile(path.resolve(root, "artifacts/external-actions.jsonl"), `${JSON.stringify({ action: "preview_build", builds })}\n`);
    return NextResponse.json({ ok: true, builds, build: builds[0] });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Preview build failed.";
    return NextResponse.json({ ok: false, message: "Preview build failed.", detail }, { status: 502 });
  }
}
