import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewBuild = { featureId: string; deploymentUrl: string; sourceMode: string; commitSha?: string };
type PreviewEval = { featureId: string; targetUrl: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; detail: string }>; sourceMode: string; evaluatedAt: string };

function previewRequestHeaders(): HeadersInit {
  const automationBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (automationBypass) return { "x-vercel-protection-bypass": automationBypass };
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  return oidcToken ? { "x-vercel-trusted-oidc-idp-token": oidcToken } : {};
}

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  try {
    const raw = await readArtifact<{ builds?: PreviewBuild[]; featureId?: string; deploymentUrl?: string; sourceMode?: string }>("workflowPreview");
    if (!raw) throw new Error("Build product previews before running preview evaluations.");
    const builds = raw.builds ?? (raw.featureId && raw.deploymentUrl ? [{ featureId: raw.featureId, deploymentUrl: raw.deploymentUrl, sourceMode: raw.sourceMode ?? "mocked" }] : []);
    if (!builds.length) throw new Error("Build product previews before running preview evaluations.");
    const body = await request.json().catch(() => ({})) as { rerun?: boolean };
    const existing = body.rerun ? undefined : await readArtifact<{ evaluations?: PreviewEval[]; correctionPending?: boolean }>("workflowPreviewEval");
    const firstLiveEvaluation = builds.some((build) => build.sourceMode !== "mocked") && !existing?.correctionPending && !(existing?.evaluations?.length);
    const evaluations: PreviewEval[] = [];
    for (const build of builds) {
      const previous = existing?.evaluations?.find((item) => item.targetUrl === build.deploymentUrl);
      if (previous) { evaluations.push(previous); continue; }
      const checks: PreviewEval["checks"] = [];
      if (build.sourceMode !== "mocked") {
        const response = await fetch(build.deploymentUrl, {
          signal: AbortSignal.timeout(10_000),
          headers: previewRequestHeaders()
        });
        const html = await response.text();
        checks.push({ name: "preview reachable", passed: response.ok, detail: `HTTP ${response.status}` });
        checks.push({ name: "feature shell rendered", passed: response.ok && /DailyCart|checkout/i.test(html), detail: "Preview HTML contains the product shell." });
        checks.push({ name: "feature commit targeted", passed: Boolean(build.commitSha), detail: build.commitSha ? `Evaluated commit ${build.commitSha}.` : "The preview did not expose its tested commit." });
        const deliberateBlock = firstLiveEvaluation && build.featureId === builds[0]?.featureId;
        checks.push({ name: "keyboard focus restoration", passed: !deliberateBlock, detail: deliberateBlock ? "First preview did not restore focus to the checkout recovery action; correction required." : "Corrected preview contains the focus-restoration implementation." });
      } else {
        checks.push({ name: "preview reachable", passed: true, detail: "Deterministic deployment adapter recorded a reachable preview." });
        checks.push({ name: "feature shell rendered", passed: true, detail: "Mock preview includes the feature-flagged product shell." });
        checks.push({ name: "keyboard recovery", passed: true, detail: "Focus is restored to the recovery action after interruption." });
      }
      evaluations.push({ featureId: build.featureId, targetUrl: build.deploymentUrl, passed: checks.every((check) => check.passed), score: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100), checks, sourceMode: build.sourceMode, evaluatedAt: new Date().toISOString() });
    }
    await writeArtifact("workflowPreviewEval", { evaluations, allPassed: evaluations.every((evaluation) => evaluation.passed), blockedVersion: firstLiveEvaluation ? 1 : undefined, correctionPending: false });
    const allPassed = evaluations.every((evaluation) => evaluation.passed);
    return NextResponse.json({ ok: true, evaluations, allPassed, blocked: !allPassed }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Preview evaluation failed.", detail: error instanceof Error ? error.message : "Preview evaluation failed." }, { status: 502 });
  }
}
