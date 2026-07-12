import { execFile } from "node:child_process";
import path from "node:path";
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
  try {
    await execFileAsync(path.resolve(root, "node_modules/.bin/tsx"), ["scripts/demo-reset.ts"], { cwd: root, env: process.env, timeout: 120_000, maxBuffer: 2_000_000 });
    return NextResponse.json({ ok: true, action: "reset" });
  } catch {
    return NextResponse.json({ ok: false, action: "reset", message: "The deterministic demo reset could not be completed." }, { status: 500 });
  }
}
