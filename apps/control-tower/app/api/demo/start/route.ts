import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { resetDeterministicDemo } from "@/lib/demo-runtime";
import { recordActionReceipt } from "@/lib/durable-artifacts";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { loadCompanyContextPack } from "@dailycart/agents";
import { createConnectorSuite } from "@dailycart/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const sessionId = `SESSION-${Date.now()}`;
  const workflowId = `WORKFLOW-${Date.now()}`;
  const actionId = `ACTION-${randomUUID().slice(0, 8).toUpperCase()}`;
  try {
    await resetDeterministicDemo({ root: path.resolve(process.cwd(), "../.."), now: new Date().toISOString() });
    const contextPack = await loadCompanyContextPack(path.resolve(process.cwd(), "../.."), { expectedVersion: "1.0.0" });
    const database = createConnectorSuite({ env: process.env }).database; const at = new Date().toISOString();
    await database.upsert("entities", { id: sessionId, entity_type: "demo_session", title: "DailyCart guided demo session", source_mode: process.env.INTEGRATION_MODE === "live" ? "live" : "mocked", payload: { workflowId, contextPackId: "CONTEXT-9001", status: "active", createdAt: at }, updated_at: at }, "id");
    await database.upsert("entities", { id: "CONTEXT-9001", entity_type: "context_pack", title: `DailyCart company context ${contextPack.version}`, source_mode: "synthetic", payload: { version: contextPack.version, manifest: contextPack.manifest, categories: contextPack.categories, evidence: contextPack.evidence }, updated_at: at }, "id");
    const receipt = await recordActionReceipt({ actionId, sessionId, workflowId, status: "succeeded", phase: "context", message: "Guided demo session created from the versioned company context.", nextAction: "Open Company data and analyze the evidence-ranked opportunities.", deepLink: "/company", sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback", at, externalRefs: [{ provider: "supabase", id: sessionId }, { provider: "supabase", id: "CONTEXT-9001" }] });
    const response = NextResponse.json({ ok: true, receipt });
    response.cookies.set("dailycart_demo_session", sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, message: "The guided session could not be created.", detail: error instanceof Error ? error.message : "Persistence failed." }, { status: 500 });
  }
}
