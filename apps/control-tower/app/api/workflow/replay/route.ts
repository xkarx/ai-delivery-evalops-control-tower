import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resetDeterministicDemo } from "@/lib/demo-runtime";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { readArtifact, recordActionReceipt } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    const workflow = await readArtifact<Record<string, unknown>>("workflow");
    const archive = `REPLAY-${stamp}`;
    await recordActionReceipt({ actionId: `ACTION-${randomUUID().slice(0, 8).toUpperCase()}`, sessionId: archive, workflowId: typeof workflow?.featureId === "string" ? workflow.featureId : undefined, status: "succeeded", phase: "replay", message: "The previous workflow was archived and the active scenario was reset.", nextAction: "Start a new guided demo from Company data.", deepLink: "/company", sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback", at: new Date().toISOString(), externalRefs: [] });
    await resetDeterministicDemo({ root, seed: Number(process.env.SYNTHETIC_DATA_SEED ?? 20260710), scenario: process.env.COMPANY_SCENARIO ?? "checkout-friction" });
    return NextResponse.json({ ok: true, action: "replay", archive });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Replay could not be completed." }, { status: 500 });
  }
}
