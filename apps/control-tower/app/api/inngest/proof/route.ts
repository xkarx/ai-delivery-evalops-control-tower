import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { inngest } from "@/lib/inngest/client";
import { readArtifact, recordActionReceipt } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  try {
    const workflow = await readArtifact<{ featureId?: string; featureTracks?: Array<{ featureId: string }>; workflow?: { id?: string }; phase?: string }>("workflow");
    const proofId = `INNGEST-PROOF-${randomUUID().slice(0, 8).toUpperCase()}`;
    const result = await inngest.send({
      id: proofId,
      name: "dailycart/workflow.completed",
      data: {
        proofId,
        workflowId: workflow?.workflow?.id ?? "replayed-workflow",
        featureId: workflow?.featureId,
        featureIds: workflow?.featureTracks?.map((track) => track.featureId) ?? [],
        phase: workflow?.phase ?? "replay_verified"
      }
    });
    const eventId = result.ids[0];
    if (!eventId) throw new Error("Inngest accepted the request without returning an event ID.");
    await recordActionReceipt({
      actionId: `ACTION-${randomUUID().slice(0, 8).toUpperCase()}`,
      sessionId: proofId,
      workflowId: workflow?.workflow?.id,
      status: "queued",
      phase: "inngest_proof",
      message: "Inngest accepted the durable workflow proof event.",
      nextAction: "Inspect the Inngest function run and persisted step output.",
      deepLink: "/integrations",
      sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback",
      at: new Date().toISOString(),
      externalRefs: [{ provider: "inngest", id: eventId, url: `https://app.inngest.com/env/${process.env.INNGEST_ENVIRONMENT ?? "production"}/events/${eventId}` }]
    });
    return NextResponse.json({ ok: true, proofId, eventId, url: `https://app.inngest.com/env/${process.env.INNGEST_ENVIRONMENT ?? "production"}/events/${eventId}` }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Inngest proof event could not be queued.", detail: error instanceof Error ? error.message : "Unexpected Inngest error." }, { status: 502 });
  }
}
