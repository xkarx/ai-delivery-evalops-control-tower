import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createSampleProductAdapter } from "@dailycart/sample-product";
import { NextResponse } from "next/server";

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
  try {
    const payload = await request.json().catch(() => ({}));
    const config = { ...defaultConfig, ...(payload ?? {}), costControls: { ...defaultConfig.costControls, ...(payload?.costControls ?? {}) } };
    const result = await createSampleProductAdapter({ env: process.env }).startTraffic(config);
    const root = path.resolve(process.cwd(), "../..");
    const eventsDir = path.resolve(root, "artifacts");
    await mkdir(eventsDir, { recursive: true });
    if (result.events.length) await appendFile(path.resolve(eventsDir, "product-events.jsonl"), `${result.events.map((event) => JSON.stringify(event)).join("\n")}\n`);
    return NextResponse.json({ ok: true, run: { runId: result.runId, eventCount: result.events.length, users: result.effectiveUserCount, funnel: result.funnel, sourceMode: result.sourceMode, capped: result.capped, stopReason: result.stopReason, exposureCount: result.exposureCount, failureCount: result.failureCount } });
  } catch {
    return NextResponse.json({ ok: false, message: "Traffic run could not be started." }, { status: 400 });
  }
}
