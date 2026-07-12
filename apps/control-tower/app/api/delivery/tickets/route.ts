import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { recordActionReceipt } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  try {
    const body = await request.json() as { title?: string; description?: string; featureId?: string };
    if (!body.title || !body.description) return NextResponse.json({ ok: false, message: "Title and description are required." }, { status: 400 });
    const suite = createConnectorSuite({ env: process.env });
    const ticket = await suite.issueTracker.createTicket({ title: body.title, description: body.description, featureId: body.featureId, ticketId: body.featureId, dependsOn: [] });
    let notification;
    try {
      notification = await suite.chat.postMessage({ text: `DailyCart delivery ticket created: ${ticket.identifier} · ${ticket.title}`, metadata: { featureId: body.featureId, ticketId: ticket.identifier } });
    } catch (error) {
      const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "The notification provider returned an unexpected error.";
      console.error("Delivery ticket notification failed", detail);
      return NextResponse.json({ ok: false, partial: true, ticket, message: "Ticket created, but the Slack notification failed.", detail }, { status: 502 });
    }
    const action = await recordActionReceipt({ actionId: `ACTION-${Date.now()}`, sessionId: "operator", status: "succeeded", phase: "ticket_created", message: `${ticket.identifier} created and announced.`, nextAction: "Open the delivery roadmap.", deepLink: "/delivery", sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback", at: new Date().toISOString(), externalRefs: [{ provider: "linear", id: ticket.externalId, url: ticket.url }, { provider: "slack", id: notification.externalId, url: notification.url }] });
    return NextResponse.json({ ok: true, ticket, notification, action });
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "The provider returned an unexpected error.";
    console.error("Delivery ticket action failed", detail);
    return NextResponse.json({ ok: false, message: "Ticket creation or Slack notification failed.", detail }, { status: 502 });
  }
}
