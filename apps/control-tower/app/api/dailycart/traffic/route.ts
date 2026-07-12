import { ConnectorError, type TrafficConfig } from "@dailycart/connectors";
import { createPersistentCustomerIds, generateTraffic, validateTrafficConfig } from "@dailycart/sample-product";
import { NextResponse } from "next/server";
import { currentTrafficRun, isTrafficRunning, nextTrafficRunSequence, saveTrafficRun, setTrafficRunning } from "@/lib/traffic-sidecar";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  try {
    if (isTrafficRunning()) throw new ConnectorError({ provider: "sample-product", code: "INVALID_REQUEST", message: "A traffic run is already active." });
    const config = await request.json() as TrafficConfig;
    validateTrafficConfig(config);
    setTrafficRunning(true);
    const result = generateTraffic(config, {
      runSequence: nextTrafficRunSequence(),
      sourceMode: "live",
      customerIds: createPersistentCustomerIds(config.customerPoolSize ?? 50)
    });
    saveTrafficRun(result);
    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Traffic sidecar failed.";
    return NextResponse.json({ ok: false, message: "Traffic sidecar could not start.", detail }, { status: 400 });
  } finally {
    setTrafficRunning(false);
  }
}

export async function GET() {
  return NextResponse.json({ running: isTrafficRunning(), lastRun: currentTrafficRun() });
}
