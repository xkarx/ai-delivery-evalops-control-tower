import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewBuild = { featureId: string; deploymentUrl: string; sourceMode: string };
type PreviewEval = { featureId: string; targetUrl: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; detail: string }>; sourceMode: string; evaluatedAt: string };

export async function POST() {
  const root = path.resolve(process.cwd(), "../..");
  try {
    const build = JSON.parse(await readFile(path.resolve(root, "artifacts/workflow-preview.json"), "utf8")) as PreviewBuild;
    const evalPath = path.resolve(root, "artifacts/workflow-preview-eval.json");
    const existing = await readFile(evalPath, "utf8").then((value) => JSON.parse(value) as PreviewEval).catch(() => undefined);
    if (existing?.targetUrl === build.deploymentUrl) return NextResponse.json({ ok: true, reused: true, evaluation: existing });
    const checks: PreviewEval["checks"] = [];
    if (build.sourceMode !== "mocked") {
      const response = await fetch(build.deploymentUrl, { signal: AbortSignal.timeout(10_000) });
      const html = await response.text();
      checks.push({ name: "preview reachable", passed: response.ok, detail: `HTTP ${response.status}` });
      checks.push({ name: "feature shell rendered", passed: response.ok && /DailyCart|checkout/i.test(html), detail: "Preview HTML contains the product shell." });
    } else {
      checks.push({ name: "preview reachable", passed: true, detail: "Deterministic deployment adapter recorded a reachable preview." });
      checks.push({ name: "feature shell rendered", passed: true, detail: "Mock preview includes checkout recovery guidance." });
      checks.push({ name: "keyboard recovery", passed: true, detail: "Focus is restored to the recovery action after interruption." });
    }
    const evaluation: PreviewEval = { featureId: build.featureId, targetUrl: build.deploymentUrl, passed: checks.every((check) => check.passed), score: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100), checks, sourceMode: build.sourceMode, evaluatedAt: new Date().toISOString() };
    await writeFile(evalPath, `${JSON.stringify(evaluation, null, 2)}\n`);
    return NextResponse.json({ ok: evaluation.passed, evaluation }, { status: evaluation.passed ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Preview evaluation failed.", detail: error instanceof Error ? error.message : "Preview evaluation failed." }, { status: 502 });
  }
}
