import { NextResponse } from "next/server";
import { demoStageSchema } from "@dailycart/schemas";
import { requestSessionId } from "@/lib/demo-session";
import { persistStructuredRecord } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const sessionId = requestSessionId(request);
  if (!sessionId) return NextResponse.json({ ok: false, detail: "An active signed demo session is required." }, { status: 409 });
  const input = await request.json().catch(() => ({})) as { stage?: string };
  const stage = demoStageSchema.safeParse(input.stage);
  if (!stage.success) return NextResponse.json({ ok: false, detail: "A valid stage is required." }, { status: 400 });
  const at = new Date().toISOString();
  await persistStructuredRecord("workflow_inspections", `${sessionId}:${stage.data}:${Date.now()}`, { sessionId, stage: stage.data, at }, sessionId);
  return NextResponse.json({ ok: true, sessionId, stage: stage.data, at });
}
