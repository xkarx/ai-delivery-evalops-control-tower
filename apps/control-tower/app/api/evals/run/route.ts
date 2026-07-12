import { readFile } from "node:fs/promises";
import path from "node:path";
import { executeEvalCampaign, createSemanticJudge, createVersionedDataset, InMemoryEvalResultStore } from "@dailycart/evals";
import { evalCaseSchema, type EvalCase } from "@dailycart/schemas";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { NextResponse } from "next/server";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { caseIds?: string[]; actualByCaseId?: Record<string, unknown>; featureId?: string };
  const root = path.resolve(process.cwd(), "../..");
  try {
    const generated = await readFile(path.resolve(root, "company/generated/evals/eval-cases.jsonl"), "utf8").then((value) => value.split("\n").filter(Boolean).map((line) => evalCaseSchema.parse(JSON.parse(line)))).catch(() => [evalCaseSchema.parse({ id: "EVALCASE-9001", datasetVersion: "dailycart-hosted@1", category: "accessibility", input: { grader: "required-fields" }, expected: { requiredFields: ["featureId"] }, critical: true, sourceMode: "synthetic" })]);
    const authored = await readArtifact<EvalCase[]>("evalAuthoredCases") ?? [];
    const cases = [...generated, ...authored].filter((item) => !body.caseIds?.length || body.caseIds.includes(item.id));
    if (!cases.length) throw new Error("No eval cases selected");
    const version = cases[0]!.datasetVersion;
    const dataset = createVersionedDataset({ id: "DATASET-0101", version, cases });
    const actualByCaseId = body.actualByCaseId ?? Object.fromEntries(cases.map((item) => [item.id, item.input.grader === "required-fields" ? { featureId: body.featureId ?? "FEAT-0001" } : item.expected]));
    const execution = await executeEvalCampaign({ campaignId: "EVAL-0101", campaignVersion: 1, featureId: body.featureId ?? "FEAT-0001", runId: "RUN-0199", dataset, actualByCaseId, requiredApprovalPresent: false, store: new InMemoryEvalResultStore(), semanticJudge: createSemanticJudge(process.env) });
    await writeArtifact("evalLastRun", execution);
    return NextResponse.json({ ok: true, campaign: execution.campaign, gate: execution.gate, results: execution.caseResults, judgeLabel: execution.judgeLabel });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Eval campaign failed." }, { status: 400 });
  }
}
