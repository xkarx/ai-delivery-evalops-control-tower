import path from "node:path";
import { NextResponse } from "next/server";
import { resetDeterministicDemo } from "@/lib/demo-runtime";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  try {
    await resetDeterministicDemo({ root, seed: Number(process.env.SYNTHETIC_DATA_SEED ?? 20260710), scenario: process.env.COMPANY_SCENARIO ?? "checkout-friction" });
    return NextResponse.json({ ok: true, action: "reset" });
  } catch {
    return NextResponse.json({ ok: false, action: "reset", message: "The deterministic demo reset could not be completed." }, { status: 500 });
  }
}
