import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewBuild = { featureId: string; branch: string; commitSha: string; commitUrl: string; pullRequestUrl: string; deploymentUrl: string; deploymentId: string; sourceMode: string; createdAt: string };

export async function POST(): Promise<Response> {
  const root = path.resolve(process.cwd(), "../..");
  const workflowPath = path.resolve(root, "artifacts/workflow-run.json");
  const buildPath = path.resolve(root, "artifacts/workflow-preview.json");
  try {
    const existing = await readFile(buildPath, "utf8").then((value) => JSON.parse(value) as PreviewBuild).catch(() => undefined);
    if (existing) return NextResponse.json({ ok: true, reused: true, build: existing });
    const workflow = JSON.parse(await readFile(workflowPath, "utf8")) as { featureId: string; featureTitle?: string };
    const suite = createConnectorSuite({ env: process.env });
    const branch = `agent/${workflow.featureId.toLowerCase()}-checkout-recovery-preview`;
    await suite.codeHost.createBranch({ name: branch });
    const productPath = "apps/control-tower/app/product/product-client.tsx";
    const source = await readFile(path.resolve(root, productPath), "utf8");
    const marker = "Built for delivery experiments";
    const updated = source.includes(marker) ? source.replace(marker, `Live feature preview · ${workflow.featureId}`) : `${source}\n// DailyCart preview build ${workflow.featureId}\n`;
    const commit = await suite.codeHost.commitFile({ path: productPath, content: updated, message: `feat(${workflow.featureId.toLowerCase()}): build checkout recovery preview`, branch });
    const pullRequest = await suite.codeHost.openPullRequest({ title: `${workflow.featureId}: checkout recovery preview`, body: `Preview build for ${workflow.featureTitle ?? workflow.featureId}.\n\nFeature: ${workflow.featureId}\nBranch: ${branch}`, head: branch, base: process.env.GITHUB_DEFAULT_BRANCH ?? "main", draft: false, featureId: workflow.featureId });
    const deployment = await suite.deployment.deploy({ id: `DEP-${String(9000 + Number(workflow.featureId.replace(/\D/g, "") || "1")).padStart(4, "0")}`, featureId: workflow.featureId, environment: "preview", commitSha: commit.commitSha, repository: process.env.GITHUB_DEFAULT_REPOSITORY, ref: branch });
    const build: PreviewBuild = { featureId: workflow.featureId, branch, commitSha: commit.commitSha, commitUrl: commit.url, pullRequestUrl: pullRequest.url, deploymentUrl: deployment.deployment.url, deploymentId: deployment.deployment.id, sourceMode: deployment.sourceMode, createdAt: new Date().toISOString() };
    await writeFile(buildPath, `${JSON.stringify(build, null, 2)}\n`);
    await appendFile(path.resolve(root, "artifacts/external-actions.jsonl"), `${JSON.stringify({ action: "preview_build", build })}\n`);
    return NextResponse.json({ ok: true, build });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Preview build failed.";
    return NextResponse.json({ ok: false, message: "Preview build failed.", detail }, { status: 502 });
  }
}
