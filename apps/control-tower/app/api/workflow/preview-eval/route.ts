import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewBuild = { featureId: string; deploymentUrl: string; sourceMode: string };
type PreviewEval = { featureId: string; targetUrl: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; detail: string }>; sourceMode: string; evaluatedAt: string };

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  try {
    const raw = JSON.parse(await readFile(path.resolve(root, "artifacts/workflow-preview.json"), "utf8")) as { builds?: PreviewBuild[]; featureId?: string; deploymentUrl?: string; sourceMode?: string };
    const builds = raw.builds ?? (raw.featureId && raw.deploymentUrl ? [{ featureId: raw.featureId, deploymentUrl: raw.deploymentUrl, sourceMode: raw.sourceMode ?? "mocked" }] : []);
    if (!builds.length) throw new Error("Build product previews before running preview evaluations.");
    const evalPath = path.resolve(root, "artifacts/workflow-preview-eval.json");
    const existing = await readFile(evalPath, "utf8").then((value) => JSON.parse(value) as { evaluations?: PreviewEval[] }).catch(() => undefined);
    const evaluations: PreviewEval[] = [];
    for (const build of builds) {
      const previous = existing?.evaluations?.find((item) => item.targetUrl === build.deploymentUrl);
      if (previous) { evaluations.push(previous); continue; }
      const checks: PreviewEval["checks"] = [];
      if (build.sourceMode !== "mocked") {
        const response = await fetch(build.deploymentUrl, { signal: AbortSignal.timeout(10_000) });
        const html = await response.text();
        checks.push({ name: "preview reachable", passed: response.ok, detail: `HTTP ${response.status}` });
        checks.push({ name: "feature shell rendered", passed: response.ok && /DailyCart|checkout/i.test(html), detail: "Preview HTML contains the product shell." });
      } else {
        checks.push({ name: "preview reachable", passed: true, detail: "Deterministic deployment adapter recorded a reachable preview." });
        checks.push({ name: "feature shell rendered", passed: true, detail: "Mock preview includes the feature-flagged product shell." });
        checks.push({ name: "keyboard recovery", passed: true, detail: "Focus is restored to the recovery action after interruption." });
      }
      evaluations.push({ featureId: build.featureId, targetUrl: build.deploymentUrl, passed: checks.every((check) => check.passed), score: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100), checks, sourceMode: build.sourceMode, evaluatedAt: new Date().toISOString() });
    }
    await writeFile(evalPath, `${JSON.stringify({ evaluations, allPassed: evaluations.every((evaluation) => evaluation.passed) }, null, 2)}\n`);
    const allPassed = evaluations.every((evaluation) => evaluation.passed);
    return NextResponse.json({ ok: allPassed, evaluations, allPassed }, { status: allPassed ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Preview evaluation failed.", detail: error instanceof Error ? error.message : "Preview evaluation failed." }, { status: 502 });
  }
}
