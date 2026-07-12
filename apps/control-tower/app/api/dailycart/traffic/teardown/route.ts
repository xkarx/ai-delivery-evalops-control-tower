import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { confirmation?: string; reason?: string };
  if (body.confirmation !== "teardown-sample-product" || !body.reason?.trim()) {
    return NextResponse.json({ ok: false, message: "Explicit teardown confirmation and reason are required." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: "The local traffic sidecar is stateless; there is no persistent product deployment to tear down." });
}
