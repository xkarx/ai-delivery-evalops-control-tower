import { NextResponse } from "next/server";
import { readArtifact } from "@/lib/durable-artifacts";
import { requestSessionId } from "@/lib/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { question?: string };
  const question = body.question?.trim() ?? "";
  if (!question) return NextResponse.json({ ok: false, message: "Ask a question about the current workflow." }, { status: 400 });
  let phase = "not_started";
  try {
    const sessionId = requestSessionId(request);
    if (!sessionId) return NextResponse.json({ ok: false, message: "An active demo session is required." }, { status: 409 });
    const stored = await readArtifact<{ workflow?: { phase?: string } }>("workflow", sessionId);
    phase = stored?.workflow?.phase ?? phase;
  } catch { /* The answer remains useful before the first run. */ }
  const lower = question.toLowerCase();
  const answer = lower.includes("why") && lower.includes("feature")
    ? "PM ranked the opportunity from recurring interview, support, analytics, and survey signals. The selected feature is the one with the strongest cross-source evidence and measurable checkout impact."
    : lower.includes("tpm")
      ? "Delivery planning converts approved product scope into workstreams, dependencies, owners, milestones, risks, and readiness checks."
      : lower.includes("eval") || lower.includes("block")
        ? "EvalOps runs deterministic and semantic checks against the candidate behavior. A critical regression blocks release even when the weighted score is high."
        : lower.includes("slack") || lower.includes("linear")
          ? "Provider sync creates the delivery tickets, posts the agent handoff thread, records a Langfuse trace, emits an Inngest event, and persists external references."
          : `The workflow is currently in ${phase}. Ask about the feature decision, TPM responsibilities, eval gate, or connected provider actions.`;
  return NextResponse.json({ ok: true, question, phase, answer, sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback" });
}
