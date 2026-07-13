import { NextResponse } from "next/server";
import { readArtifact } from "@/lib/durable-artifacts";
import { updatePresentation } from "@/lib/workflow-presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => ({})) as { command?: "continue" | "pause" | "resume"; sessionId?: string; reason?: string };
  if (!input.command || !["continue", "pause", "resume"].includes(input.command)) return NextResponse.json({ ok: false, detail: "A valid presentation command is required." }, { status: 400 });
  const stored = await readArtifact<{ sessionId?: string; workflow?: { phase?: string } }>("workflow");
  const sessionId = input.sessionId ?? stored?.sessionId;
  if (!sessionId) return NextResponse.json({ ok: false, detail: "No active demo session exists." }, { status: 404 });
  const presentation = await updatePresentation(sessionId, stored?.workflow?.phase ?? "not_started", input.command, input.reason);
  return NextResponse.json({ ok: true, presentation });
}
