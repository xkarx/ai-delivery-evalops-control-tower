import { NextResponse } from "next/server";
import { archiveDemoSession, createDemoSession, demoSessionCookie, encodeSessionCookie, requestSessionId } from "@/lib/demo-session";
import { requireOperatorOrWorkflowService } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireOperatorOrWorkflowService(request);
  if (denied) return denied;
  const current = requestSessionId(request);
  if (current) await archiveDemoSession(current);
  const session = await createDemoSession();
  const response = NextResponse.json({ ok: true, session }, { status: 201 });
  response.cookies.set(demoSessionCookie, encodeSessionCookie(session.sessionId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}
