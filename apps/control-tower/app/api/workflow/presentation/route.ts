import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return NextResponse.json({ ok: false, detail: "Independent presentation cursors were retired. The signed workflow stage now drives the demo cockpit." }, { status: 410 });
}
