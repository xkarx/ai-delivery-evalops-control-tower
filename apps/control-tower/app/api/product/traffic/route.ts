import { ConnectorError } from "@dailycart/connectors";
import { createSampleProductAdapter } from "@dailycart/sample-product";
import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultConfig = {
  userCount: 24,
  spawnRatePerSecond: 12,
  durationSeconds: 8,
  seed: 20260710,
  scenario: "mixed" as const,
  customerPoolSize: 50,
  costControls: {
    maxEstimatedUsd: 1,
    maxRuntimeSeconds: 30,
    costPerThousandEventsUsd: 0,
    maxEvents: 2_000
  }
};

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  try {
    const payload = await request.json().catch(() => ({}));
    const config = { ...defaultConfig, ...(payload ?? {}), costControls: { ...defaultConfig.costControls, ...(payload?.costControls ?? {}) } };
    const result = await createSampleProductAdapter({ env: process.env }).startTraffic(config);
    const currentEvents = await readArtifact<unknown[]>("productEvents") ?? [];
    await writeArtifact("productEvents", [...currentEvents, ...result.events].slice(-10_000));
    return NextResponse.json({ ok: true, run: { runId: result.runId, eventCount: result.events.length, users: result.effectiveUserCount, funnel: result.funnel, sourceMode: result.sourceMode, capped: result.capped, stopReason: result.stopReason, exposureCount: result.exposureCount, failureCount: result.failureCount } });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "The traffic provider returned an unexpected error.";
    return NextResponse.json({ ok: false, message: "Traffic run could not be started.", detail }, { status: 400 });
  }
}
