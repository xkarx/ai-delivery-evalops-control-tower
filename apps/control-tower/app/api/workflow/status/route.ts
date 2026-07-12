import { NextResponse } from "next/server";
import { configuredOperatorPasscode, isOperatorAuthorized } from "@/lib/operator-auth";
import { readArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const stored = await readArtifact<{ workflow?: { phase?: string; revision?: number; history?: Array<{ id: string; at: string; from: string | null; to: string; actor: string; reason: string; entityIds: string[] }>; featureId?: string }; featureTitle?: string; sourceMode?: string; agentReasoning?: Record<string, { model: string; summary: string; sourceMode: string }>; handoffThread?: { messages?: Array<{ url: string; provider: string; sourceMode: string }> }; handoffFanout?: { channels?: Record<string, { messages?: Array<{ url: string; provider: string; sourceMode: string }> }> } }>("workflow");
    if (!stored) throw new Error("No workflow");
    const workflow = stored.workflow;
    const last = workflow?.history?.at(-1);
    return NextResponse.json({
      started: Boolean(workflow),
      operator: { required: configuredOperatorPasscode(), authorized: await isOperatorAuthorized() },
      featureId: workflow?.featureId,
      featureTitle: stored.featureTitle,
      phase: workflow?.phase ?? "not_started",
      revision: workflow?.revision ?? 0,
      sourceMode: stored.sourceMode ?? process.env.INTEGRATION_MODE ?? "mock",
      currentAgent: last?.actor ?? "operator",
      nextAction: workflow?.phase === "awaiting_release_approval" ? "Human release approval is required." : workflow?.phase === "ready_to_release" ? "Deploy the approved release and sync provider records." : workflow?.phase === "released" ? "Observe product telemetry and incident feedback." : "Start the workflow from Company data.",
      reasoning: Object.values(stored.agentReasoning ?? {})[0],
      agentReasoning: stored.agentReasoning ?? {},
      links: [...(stored.handoffThread?.messages ?? []).map((message, index) => ({ label: `${message.provider} delivery handoff ${index + 1}`, url: message.url, sourceMode: message.sourceMode })), ...Object.entries(stored.handoffFanout?.channels ?? {}).flatMap(([purpose, result]) => (result.messages ?? []).slice(0, 1).map((message) => ({ label: `Slack ${purpose}`, url: message.url, sourceMode: message.sourceMode })))],
      history: workflow?.history ?? []
    });
  } catch {
    return NextResponse.json({ started: false, operator: { required: configuredOperatorPasscode(), authorized: await isOperatorAuthorized() }, phase: "not_started", revision: 0, sourceMode: process.env.INTEGRATION_MODE ?? "mock", currentAgent: "operator", nextAction: "Start the workflow from Company data.", history: [] });
  }
}
