import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite, type DeliveryTicketStatus, type TicketMetadata } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { loadDeliveryBacklog, loadDeliveryFeatures } from "@/lib/load-delivery-backlog";
import type { Ticket } from "@dailycart/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LinearSyncRecord = {
  internalId: string;
  externalId: string;
  identifier: string;
  url: string;
  sourceMode: string;
  status: DeliveryTicketStatus;
  metadata: TicketMetadata;
};
type SyncState = { records: LinearSyncRecord[]; errors: string[]; syncedAt?: string };

const owners: Record<string, string> = { experience: "PM · Maya", reliability: "TPM · Noah", platform: "Engineering · Priya" };

function deliveryStatus(ticket: Ticket, tickets: Ticket[]): Ticket["status"] {
  if (ticket.status === "todo" && ticket.dependsOn.some((dependency) => tickets.find((candidate) => candidate.id === dependency)?.status !== "done")) return "blocked";
  return ticket.status;
}

async function readState(file: string): Promise<SyncState> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<SyncState>;
    return { records: parsed.records ?? [], errors: parsed.errors ?? [], syncedAt: parsed.syncedAt };
  } catch {
    return { records: [], errors: [] };
  }
}

function metadataFor(ticket: { featureId: string; id: string; dependsOn: string[] }, feature: { evidenceIds: string[]; workstream: string }): TicketMetadata {
  return { featureId: ticket.featureId, ticketId: ticket.id, prdId: `PRD-${ticket.featureId.slice(-4)}`, evidenceIds: feature.evidenceIds, owner: owners[feature.workstream] ?? "Delivery team", dependsOn: ticket.dependsOn };
}

export async function POST() {
  const root = path.resolve(process.cwd(), "../..");
  const file = path.resolve(root, "artifacts/linear-delivery-sync.json");
  const data = await loadDemoState();
  const generatedTickets = await loadDeliveryBacklog();
  const generatedFeatures = await loadDeliveryFeatures();
  const tickets = generatedTickets.length ? generatedTickets : data.tickets;
  const features = [...data.features, ...generatedFeatures.filter((feature) => !data.features.some((candidate) => candidate.id === feature.id))];
  const suite = createConnectorSuite({ env: process.env });
  const sync = await readState(file);
  sync.errors = [];
  const byInternalId = new Map(sync.records.map((record) => [record.internalId, record]));

  for (const ticket of tickets) {
    const feature = features.find((candidate) => candidate.id === ticket.featureId);
    if (!feature) {
      sync.errors.push(`${ticket.id}: feature ${ticket.featureId} is missing`);
      continue;
    }
    const metadata = metadataFor(ticket, feature);
    const status = deliveryStatus(ticket, tickets);
    try {
      const existing = byInternalId.get(ticket.id);
      // Mock adapters are intentionally process-local; preserve the existing deterministic
      // external reference and update its recorded status without pretending a network write.
      if (existing && suite.issueTracker.mode === "mock") {
        byInternalId.set(ticket.id, { ...existing, status, metadata, sourceMode: "mocked" });
        continue;
      }
      const record = existing
        ? await suite.issueTracker.updateTicketState(existing.externalId, status)
        : await suite.issueTracker.createTicket({
            title: ticket.title,
            description: ticket.description,
            featureId: ticket.featureId,
            ticketId: ticket.id,
            prdId: metadata.prdId,
            evidenceIds: metadata.evidenceIds,
            owner: metadata.owner,
            dependsOn: ticket.dependsOn,
            workflowStatus: status
          });
      const synced: LinearSyncRecord = { internalId: ticket.id, externalId: record.externalId, identifier: record.identifier, url: record.url, sourceMode: record.sourceMode, status: record.workflowStatus ?? status, metadata: record.metadata ?? metadata };
      byInternalId.set(ticket.id, synced);
    } catch (error) {
      sync.errors.push(error instanceof ConnectorError ? `${ticket.id}: ${error.provider} · ${error.message}` : `${ticket.id}: issue tracker write failed`);
    }
  }
  sync.records = [...byInternalId.values()];
  sync.syncedAt = new Date().toISOString();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(sync, null, 2)}\n`);
  await appendFile(path.resolve(root, "artifacts/external-actions.jsonl"), `${JSON.stringify({ action: "linear_delivery_sync", sync })}\n`);
  return NextResponse.json({ ok: sync.errors.length === 0, partial: sync.records.length > 0 && sync.errors.length > 0, sync });
}
