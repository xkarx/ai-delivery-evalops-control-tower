import { readFile } from "node:fs/promises";
import path from "node:path";
import { evalCaseSchema, type EvalCase } from "@dailycart/schemas";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { NextResponse } from "next/server";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadCases(root: string): Promise<EvalCase[]> {
  const authored = await readArtifact<EvalCase[]>("evalAuthoredCases") ?? [];
  const generated = await readFile(path.resolve(root, "company/generated/evals/eval-cases.jsonl"), "utf8").then((value) => value.split("\n").filter(Boolean).map((line) => evalCaseSchema.parse(JSON.parse(line)))).catch(() => embeddedCases());
  return [...generated, ...authored];
}

export async function GET() {
  const root = path.resolve(process.cwd(), "../..");
  return NextResponse.json({ ok: true, cases: await loadCases(root) });
}

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as Partial<EvalCase>;
  const root = path.resolve(process.cwd(), "../..");
  try {
    const existing = await loadCases(root);
    const nextId = `EVALCASE-${String(Math.max(0, ...existing.map((item) => Number(item.id.split("-").at(-1) ?? 0))) + 1).padStart(4, "0")}`;
    const item = evalCaseSchema.parse({ id: body.id ?? nextId, datasetVersion: body.datasetVersion ?? `dailycart-authored@${new Date().toISOString().slice(0, 10)}`, category: body.category ?? "requirements", input: body.input ?? { grader: "required-fields" }, expected: body.expected ?? { requiredFields: ["featureId"] }, critical: body.critical ?? false, sourceMode: "live" });
    const authored = await readArtifact<EvalCase[]>("evalAuthoredCases") ?? [];
    authored.push(item);
    await writeArtifact("evalAuthoredCases", authored);
    return NextResponse.json({ ok: true, case: item });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Eval case could not be saved." }, { status: 400 });
  }
}

function embeddedCases(): EvalCase[] {
  return [
    evalCaseSchema.parse({ id: "EVALCASE-9001", datasetVersion: "dailycart-hosted@1", category: "accessibility", input: { grader: "required-fields" }, expected: { requiredFields: ["featureId"] }, critical: true, sourceMode: "synthetic" }),
    evalCaseSchema.parse({ id: "EVALCASE-9002", datasetVersion: "dailycart-hosted@1", category: "regression", input: { grader: "required-fields" }, expected: { requiredFields: ["featureId"] }, critical: true, sourceMode: "synthetic" })
  ];
}
