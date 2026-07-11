import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createConnectorSuite } from "@dailycart/connectors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { title?: string; description?: string; featureId?: string };
    if (!body.title || !body.description) return NextResponse.json({ ok: false, message: "Title and description are required." }, { status: 400 });
    const suite = createConnectorSuite({ env: process.env });
    const ticket = await suite.issueTracker.createTicket({ title: body.title, description: body.description, featureId: body.featureId, ticketId: body.featureId, dependsOn: [] });
    const notification = await suite.chat.postMessage({ text: `DailyCart delivery ticket created: ${ticket.identifier} · ${ticket.title}`, metadata: { featureId: body.featureId, ticketId: ticket.identifier } });
    const root = path.resolve(process.cwd(), "../..");
    await mkdir(path.resolve(root, "artifacts"), { recursive: true });
    await appendFile(path.resolve(root, "artifacts/external-actions.jsonl"), `${JSON.stringify({ action: "create_ticket", ticket, notification, at: new Date().toISOString() })}\n`);
    return NextResponse.json({ ok: true, ticket, notification });
  } catch {
    return NextResponse.json({ ok: false, message: "Ticket creation or Slack notification failed. Check the integration health and credentials." }, { status: 502 });
  }
}
