import { productEventSchema } from "@dailycart/schemas";
import { ConnectorError, createProductAnalyticsAdapter } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { appendArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const event = productEventSchema.parse(await request.json());
    const analytics = createProductAnalyticsAdapter({ env: process.env });
    const reference = await analytics.capture(event);
    await appendArtifact("productEvents", event, 10_000);
    return NextResponse.json({ ok: true, eventId: event.id, sourceMode: reference.sourceMode, externalUrl: reference.url });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "The analytics provider returned an unexpected error.";
    console.error("Product event capture failed", detail);
    return NextResponse.json({ ok: false, message: "Product event capture failed.", detail }, { status: 502 });
  }
}
