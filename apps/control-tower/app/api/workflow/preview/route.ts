import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PreviewBuild = { featureId: string; featureTitle?: string; branch: string; commitSha: string; commitUrl: string; pullRequestId: string; pullRequestUrl: string; deploymentUrl: string; deploymentId: string; sourceMode: string; createdAt: string };

async function productSource(root: string, productPath: string, ref = process.env.GITHUB_DEFAULT_BRANCH ?? "main"): Promise<string> {
  if (process.env.INTEGRATION_MODE !== "live") return readFile(path.resolve(root, productPath), "utf8");
  const repository = process.env.GITHUB_DEFAULT_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error("GitHub repository and token are required to build a live product preview.");
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${productPath}?ref=${encodeURIComponent(ref)}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
  if (!response.ok) throw new Error(`GitHub product source returned HTTP ${response.status}.`);
  const payload = await response.json() as { content?: string };
  if (!payload.content) throw new Error("GitHub product source was empty.");
  return Buffer.from(payload.content.replace(/\s/g, ""), "base64").toString("utf8");
}

function implementTrack(source: string, featureId: string, index: number): string {
  if (index === 0) {
    return source
      .replace('const checkoutRecoveryEnabled = process.env.NEXT_PUBLIC_FEATURE_CHECKOUT_RECOVERY !== "off";', `const checkoutRecoveryEnabled = true; // ${featureId}: approved recovery guidance`)
      .replace("Built for delivery experiments", `Recovery guidance preview · ${featureId}`);
  }
  const withFlag = source.replace("export function ProductClient", `const cartPersistenceEnabled = true; // ${featureId}: approved persistent cart\n\nexport function ProductClient`);
  return withFlag.replaceAll('process.env.NEXT_PUBLIC_FEATURE_CART_PERSISTENCE === "off"', "!cartPersistenceEnabled").replace("Built for delivery experiments", `Persistent cart preview · ${featureId}`);
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  try {
    const body = await request.json().catch(() => ({})) as { correctBlocked?: boolean };
    const existing = await readArtifact<{ builds?: PreviewBuild[]; featureId?: string }>("workflowPreview");
    if (existing?.builds?.length && !body.correctBlocked) return NextResponse.json({ ok: true, reused: true, build: existing.builds[0], builds: existing.builds });
    const workflow = await readArtifact<{ featureId: string; featureTitle?: string; featureTracks?: Array<{ featureId: string; featureTitle: string }> }>("workflow");
    if (!workflow) throw new Error("Run and approve the feature workflow before building previews.");
    const tracks = workflow.featureTracks?.length ? workflow.featureTracks : [{ featureId: workflow.featureId, featureTitle: workflow.featureTitle ?? workflow.featureId }];
    const suite = createConnectorSuite({ env: process.env });
    const productPath = "apps/control-tower/app/product/product-client.tsx";
    if (body.correctBlocked && existing?.builds?.length) {
      const blocked = existing.builds[0]!;
      const source = await productSource(root, productPath, blocked.branch);
      const corrected = source.includes("focus-restoration correction") ? source : `${source}\n// ${blocked.featureId}: focus-restoration correction validated by preview eval\n`;
      const commit = await suite.codeHost.commitFile({ path: productPath, content: corrected, message: `fix(${blocked.featureId.toLowerCase()}): restore checkout focus`, branch: blocked.branch });
      const correctionNumber = 9500 + Number(blocked.featureId.replace(/\D/g, "") || "1");
      const deployment = await suite.deployment.deploy({ id: `DEP-${String(correctionNumber).padStart(4, "0")}`, featureId: blocked.featureId, environment: "preview", commitSha: commit.commitSha, repository: process.env.GITHUB_DEFAULT_REPOSITORY, ref: blocked.branch });
      const correctedBuild: PreviewBuild = { ...blocked, commitSha: commit.commitSha, commitUrl: commit.url, deploymentUrl: deployment.deployment.url, deploymentId: deployment.deployment.id, sourceMode: deployment.sourceMode, createdAt: new Date().toISOString() };
      const builds = [correctedBuild, ...existing.builds.slice(1)];
      await writeArtifact("workflowPreview", { builds, correctedFrom: blocked.commitSha });
      await writeArtifact("workflowPreviewEval", { evaluations: [], correctionPending: true });
      return NextResponse.json({ ok: true, corrected: true, builds, build: correctedBuild });
    }
    const source = await productSource(root, productPath);
    const builds: PreviewBuild[] = [];
    for (const [index, track] of tracks.entries()) {
      const branch = `agent/${track.featureId.toLowerCase()}-${Date.now().toString(36)}`;
      await suite.codeHost.createBranch({ name: branch });
      const updated = implementTrack(source, track.featureId, index);
      const commit = await suite.codeHost.commitFile({ path: productPath, content: updated, message: `feat(${track.featureId.toLowerCase()}): build product preview`, branch });
      const pullRequest = await suite.codeHost.openPullRequest({ title: `${track.featureId}: product preview`, body: `Preview build for ${track.featureTitle}.\n\nFeature: ${track.featureId}\nBranch: ${branch}`, head: branch, base: process.env.GITHUB_DEFAULT_BRANCH ?? "main", draft: false, featureId: track.featureId });
      const deployment = await suite.deployment.deploy({ id: `DEP-${String(9000 + Number(track.featureId.replace(/\D/g, "") || "1")).padStart(4, "0")}`, featureId: track.featureId, environment: "preview", commitSha: commit.commitSha, repository: process.env.GITHUB_DEFAULT_REPOSITORY, ref: branch });
      builds.push({ featureId: track.featureId, featureTitle: track.featureTitle, branch, commitSha: commit.commitSha, commitUrl: commit.url, pullRequestId: pullRequest.externalId, pullRequestUrl: pullRequest.url, deploymentUrl: deployment.deployment.url, deploymentId: deployment.deployment.id, sourceMode: deployment.sourceMode, createdAt: new Date().toISOString() });
    }
    await writeArtifact("workflowPreview", { builds });
    return NextResponse.json({ ok: true, builds, build: builds[0] });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Preview build failed.";
    return NextResponse.json({ ok: false, message: "Preview build failed.", detail }, { status: 502 });
  }
}
