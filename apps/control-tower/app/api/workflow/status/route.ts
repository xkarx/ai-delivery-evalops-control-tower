import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const root = path.resolve(process.cwd(), "../..");
    const stored = JSON.parse(await readFile(path.resolve(root, "artifacts/workflow-run.json"), "utf8")) as { workflow?: { phase?: string; revision?: number; history?: Array<{ id: string; at: string; from: string | null; to: string; actor: string; reason: string; entityIds: string[] }>; featureId?: string }; featureTitle?: string; sourceMode?: string; agentReasoning?: Record<string, { model: string; summary: string; sourceMode: string }> };
    const workflow = stored.workflow;
    const last = workflow?.history?.at(-1);
    return NextResponse.json({
      started: Boolean(workflow),
      featureId: workflow?.featureId,
      featureTitle: stored.featureTitle,
      phase: workflow?.phase ?? "not_started",
      revision: workflow?.revision ?? 0,
      sourceMode: stored.sourceMode ?? process.env.INTEGRATION_MODE ?? "mock",
      currentAgent: last?.actor ?? "operator",
      nextAction: workflow?.phase === "awaiting_release_approval" ? "Human release approval is required." : workflow?.phase === "ready_to_release" ? "Deploy the approved release and sync provider records." : workflow?.phase === "released" ? "Observe product telemetry and incident feedback." : "Start the workflow from Company data.",
      agentReasoning: stored.agentReasoning ?? {},
      history: workflow?.history ?? []
    });
  } catch {
    return NextResponse.json({ started: false, phase: "not_started", revision: 0, sourceMode: process.env.INTEGRATION_MODE ?? "mock", currentAgent: "operator", nextAction: "Start the workflow from Company data.", history: [] });
  }
}
