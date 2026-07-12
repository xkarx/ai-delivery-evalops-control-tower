import { NextResponse } from "next/server";
import { operatorSessionResponse } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { passcode?: string };
  const passcode = body.passcode?.trim() ?? "";
  const expected = process.env.DAILYCART_OPERATOR_PASSCODE?.trim();
  if (!expected) return NextResponse.json({ ok: false, message: "DAILYCART_OPERATOR_PASSCODE is not configured in the deployment." }, { status: 503 });
  if (!passcode || passcode !== expected) return NextResponse.json({ ok: false, message: "That operator passcode was not accepted." }, { status: 401 });
  return operatorSessionResponse({ ok: true, message: "Live actions unlocked for this browser session." });
}
