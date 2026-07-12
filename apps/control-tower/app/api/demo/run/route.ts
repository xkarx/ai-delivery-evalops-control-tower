import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { runDeterministicDemo } from "@/lib/demo-runtime";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  let result: Awaited<ReturnType<typeof runDeterministicDemo>>;
  try {
    result = await runDeterministicDemo({ root, seed: Number(process.env.SYNTHETIC_DATA_SEED ?? 20260710), scenario: process.env.COMPANY_SCENARIO ?? "checkout-friction" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The deterministic workflow failed.";
    console.error("Demo workflow failed", detail);
    return NextResponse.json({ ok: false, action: "run", message: "The deterministic demo run could not be completed.", detail }, { status: 500 });
  }
  try {
    const notification = await createConnectorSuite({ env: process.env }).chat.postMessage({ text: "DailyCart demo run completed: traffic, delivery workstreams, blocked eval, correction, and release evidence were recorded.", metadata: { source: "control-tower-demo" } });
    try {
      await mkdir(path.resolve(root, "artifacts"), { recursive: true });
      await appendFile(path.resolve(root, "artifacts/external-actions.jsonl"), `${JSON.stringify({ action: "demo_run_notification", notification, at: new Date().toISOString() })}\n`);
    } catch (error) {
      console.warn("Demo notification audit file could not be persisted.", error instanceof Error ? error.message : String(error));
    }
    return NextResponse.json({ ok: true, action: "run", notification, result });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "The notification provider returned an unexpected error.";
    console.error("Demo notification failed", detail);
    return NextResponse.json({ ok: false, partial: true, action: "run", runCompleted: true, message: "Demo run completed, but the external status notification failed.", detail }, { status: 502 });
  }
}
