import { NextResponse } from "next/server";
import { getDemoSession, requestSessionId } from "@/lib/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const sessionId = requestSessionId(request);
  if (!sessionId) return NextResponse.json({ session: null });
  return NextResponse.json({ session: await getDemoSession(sessionId) ?? { sessionId, status: "active" } });
}
