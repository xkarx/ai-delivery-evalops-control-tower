import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";

const execFileAsync = promisify(execFile);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    const replayDir = path.resolve(root, "artifacts/replays", stamp);
    await mkdir(replayDir, { recursive: true });
    for (const file of ["workflow-run.json", "demo-state.json", "workflow-preview.json", "workflow-preview-eval.json"]) {
      await copyFile(path.resolve(root, "artifacts", file), path.resolve(replayDir, file)).catch(() => undefined);
    }
    await execFileAsync(path.resolve(root, "node_modules/.bin/tsx"), ["scripts/demo-reset.ts"], { cwd: root, env: process.env, timeout: 120_000, maxBuffer: 2_000_000 });
    return NextResponse.json({ ok: true, action: "replay", archive: `artifacts/replays/${stamp}` });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Replay could not be completed." }, { status: 500 });
  }
}
