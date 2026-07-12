import { NextResponse } from "next/server";
import { currentTrafficRun } from "@/lib/traffic-sidecar";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const run = currentTrafficRun();
  return NextResponse.json({ ok: true, run: run ? { ...run, stopReason: "stopped" as const, endedAt: new Date().toISOString() } : undefined });
}
