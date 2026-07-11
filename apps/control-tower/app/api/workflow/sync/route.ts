import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncState = { ticketRecords: Array<{ internalId: string; identifier: string; url: string; sourceMode: string }>; notification?: { provider: string; url: string; sourceMode: string }; trace?: { url: string; sourceMode: string }; workflowEvent?: { url: string; sourceMode: string }; errors: string[] };

async function readSync(file: string): Promise<SyncState | undefined> { try { return JSON.parse(await readFile(file, "utf8")) as SyncState; } catch { return undefined; } }

export async function POST() {
  const root = path.resolve(process.cwd(), "../..");
  const file = path.resolve(root, "artifacts/workflow-external-sync.json");
  try {
    const existing = await readSync(file);
    const workflow = JSON.parse(await readFile(path.resolve(root, "artifacts/workflow-run.json"), "utf8")) as { featureId: string };
    const data = await loadDemoState();
    const suite = createConnectorSuite({ env: process.env });
    const state: SyncState = existing ?? { ticketRecords: [], errors: [] };
    const known = new Set(state.ticketRecords.map((record) => record.internalId));
    for (const ticket of data.tickets.filter((item) => item.featureId === workflow.featureId)) {
      if (known.has(ticket.id)) continue;
      try {
        const record = await suite.issueTracker.createTicket({ title: ticket.title, description: ticket.description, featureId: ticket.featureId, ticketId: ticket.id, dependsOn: ticket.dependsOn });
        state.ticketRecords.push({ internalId: ticket.id, identifier: record.identifier, url: record.url, sourceMode: record.sourceMode });
      } catch (error) {
        state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Issue tracker write failed.");
      }
    }
    if (!state.notification) {
      try {
        const notification = await suite.chat.postMessage({ text: `DailyCart workflow delivery records synced: ${state.ticketRecords.map((record) => record.identifier).join(", ") || "none"}.`, metadata: { source: "dailycart-workflow-sync", featureId: workflow.featureId } });
        state.notification = { provider: notification.provider, url: notification.url, sourceMode: notification.sourceMode };
      } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Slack write failed."); }
    }
    if (!state.trace) {
      try {
        const trace = await suite.trace.startTrace({ id: "dailycart-workflow-v1", name: "DailyCart V1 delivery workflow", input: { featureId: workflow.featureId, ticketIds: data.tickets.map((ticket) => ticket.id) }, metadata: { source: "control-tower-workflow-sync", mode: process.env.INTEGRATION_MODE ?? "mock" }, tags: ["dailycart", "delivery", "v1"] });
        state.trace = { url: trace.url, sourceMode: trace.sourceMode };
        try { await suite.trace.addScore({ traceId: trace.externalId, name: "workflow_completed", value: true, comment: "PM, TPM, engineering, eval, approval, and delivery records are linked." }); } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Trace score write failed."); }
      } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Trace write failed."); }
    }
    if (!state.workflowEvent) {
      try {
        const event = await suite.workflow.emit({ id: "dailycart-workflow-v1", name: "dailycart/workflow.completed", data: { featureId: workflow.featureId, ticketIds: data.tickets.filter((ticket) => ticket.featureId === workflow.featureId).map((ticket) => ticket.id), phase: "ready_to_release" } });
        state.workflowEvent = { url: event.url, sourceMode: event.sourceMode };
      } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Workflow event write failed."); }
    }
    try {
      await suite.database.upsert("workflow_runs", { id: "RUN-0101", workflow_type: "dailycart_delivery", status: "succeeded", feature_id: workflow.featureId, state: { phase: "ready_to_release", ticketIds: state.ticketRecords.map((record) => record.internalId) }, trace_id: state.trace?.url ?? null, source_mode: process.env.INTEGRATION_MODE === "live" ? "live" : "mocked" }, "id");
      for (const ticket of state.ticketRecords) {
        await suite.database.upsert("external_references", { entity_id: ticket.internalId, provider: "issue-tracker", external_id: ticket.identifier, url: ticket.url, sync_status: "synced", last_synced_at: new Date().toISOString() }, "provider,external_id");
      }
    } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Supabase workflow state write failed."); }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
    await appendFile(path.resolve(root, "artifacts/external-actions.jsonl"), `${JSON.stringify({ action: "workflow_sync", state, at: new Date().toISOString() })}\n`);
    return NextResponse.json({ ok: state.errors.length === 0, partial: state.errors.length > 0 && state.ticketRecords.length > 0, sync: state });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Workflow records could not be synchronized.", detail: error instanceof Error ? error.message : "Unexpected synchronization error." }, { status: 502 });
  }
}
