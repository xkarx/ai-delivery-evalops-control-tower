import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { productEventSchema } from "@dailycart/schemas";
import { createProductAnalyticsAdapter } from "@dailycart/connectors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const event = productEventSchema.parse(await request.json());
    const analytics = createProductAnalyticsAdapter({ env: process.env });
    const reference = await analytics.capture(event);
    const root = path.resolve(process.cwd(), "../..");
    const eventsDir = path.resolve(root, "artifacts");
    await mkdir(eventsDir, { recursive: true });
    await appendFile(path.resolve(eventsDir, "product-events.jsonl"), `${JSON.stringify(event)}\n`);
    return NextResponse.json({ ok: true, eventId: event.id, sourceMode: reference.sourceMode, externalUrl: reference.url });
  } catch {
    return NextResponse.json({ ok: false, message: "Product event was rejected." }, { status: 400 });
  }
}
