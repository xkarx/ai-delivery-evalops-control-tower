import { NextResponse } from "next/server";
import { archiveDemoSession, createDemoSession, demoSessionCookie, encodeSessionCookie, executionModeSchema, requestSessionId } from "@/lib/demo-session";
import { requireOperatorOrWorkflowService } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireOperatorOrWorkflowService(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { executionMode?: string };
  const executionMode = executionModeSchema.parse(body.executionMode ?? "showcase");
  const current = requestSessionId(request);
  if (current) await archiveDemoSession(current);
  const session = await createDemoSession(executionMode);
  const response = NextResponse.json({ ok: true, session }, { status: 201 });
  response.cookies.set(demoSessionCookie, encodeSessionCookie(session.sessionId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}
