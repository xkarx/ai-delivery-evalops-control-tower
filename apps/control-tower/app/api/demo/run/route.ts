import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const root = path.resolve(process.cwd(), "../..");
  try {
    await execFileAsync(path.resolve(root, "node_modules/.bin/tsx"), ["scripts/demo-run.ts"], { cwd: root, env: process.env, timeout: 120_000, maxBuffer: 2_000_000 });
    return NextResponse.json({ ok: true, action: "run" });
  } catch {
    return NextResponse.json({ ok: false, action: "run", message: "The deterministic demo run could not be completed." }, { status: 500 });
  }
}
