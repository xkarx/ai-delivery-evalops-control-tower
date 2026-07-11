import { execFile } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const root = path.resolve(process.cwd(), "../..");
  try {
    await execFileAsync(path.resolve(root, "node_modules/.bin/tsx"), ["scripts/demo-run.ts"], { cwd: root, env: process.env, timeout: 120_000, maxBuffer: 2_000_000 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The deterministic workflow failed.";
    console.error("Demo workflow failed", detail);
    return NextResponse.json({ ok: false, action: "run", message: "The deterministic demo run could not be completed.", detail }, { status: 500 });
  }
  try {
    const notification = await createConnectorSuite({ env: process.env }).chat.postMessage({ text: "DailyCart demo run completed: traffic, delivery workstreams, blocked eval, correction, and release evidence were recorded.", metadata: { source: "control-tower-demo" } });
    await mkdir(path.resolve(root, "artifacts"), { recursive: true });
    await appendFile(path.resolve(root, "artifacts/external-actions.jsonl"), `${JSON.stringify({ action: "demo_run_notification", notification, at: new Date().toISOString() })}\n`);
    return NextResponse.json({ ok: true, action: "run", notification });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "The notification provider returned an unexpected error.";
    console.error("Demo notification failed", detail);
    return NextResponse.json({ ok: false, partial: true, action: "run", runCompleted: true, message: "Demo run completed, but the external status notification failed.", detail }, { status: 502 });
  }
}
