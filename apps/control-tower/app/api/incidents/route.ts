import { NextResponse } from "next/server";
import { createConnectorSuite } from "@dailycart/connectors";
import { evalCaseSchema, incidentSchema, type EvalCase } from "@dailycart/schemas";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { loadDemoState } from "@/lib/load-demo-state";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireOperatorAccess(); if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { title?: string; rootCause?: string; severity?: string; featureId?: string };
  if (!body.title?.trim() || !body.rootCause?.trim()) return NextResponse.json({ ok: false, message: "Title and root cause are required." }, { status: 400 });
  const data = await loadDemoState(); const ordinal = Math.max(0, ...data.incidents.map((item) => Number(item.id.split("-")[1]))) + 1; const caseOrdinal = 9000 + ordinal; const at = new Date().toISOString();
  const incident = incidentSchema.parse({ id: `INC-${String(ordinal).padStart(4, "0")}`, featureId: body.featureId ?? "FEAT-0001", title: body.title, severity: body.severity ?? "SEV-3", status: "open", detectedAt: at, rootCause: body.rootCause, regressionCaseId: `EVALCASE-${caseOrdinal}`, sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "simulated" });
  const evalCase = evalCaseSchema.parse({ id: incident.regressionCaseId, datasetVersion: `dailycart-incidents@${at.slice(0, 10)}`, category: "regression", input: { incidentId: incident.id, featureId: incident.featureId, rootCause: incident.rootCause }, expected: { mustDetectRegression: true }, critical: false, sourceMode: incident.sourceMode });
  await writeArtifact("demoState", { ...data, incidents: [incident, ...data.incidents], lineage: [{ id: `LIN-INC-${ordinal}`, sourceType: "incident", sourceId: incident.id, relationship: "created_regression_case", targetType: "eval_case", targetId: evalCase.id, createdAt: at, metadata: {} }, ...data.lineage], activity: [{ at, type: "incident", title: "Production incident declared", detail: `${incident.id} created ${evalCase.id}.`, entityId: incident.id }, ...data.activity] });
  const authored = await readArtifact<EvalCase[]>("evalAuthoredCases") ?? []; await writeArtifact("evalAuthoredCases", [...authored, evalCase]);
  const suite = createConnectorSuite({ env: process.env }); const externalRefs: Array<{ provider: string; url: string; id: string }> = [];
  try { const message = await suite.chat.postMessage({ text: `DailyCart incident ${incident.id}: ${incident.title}. Regression case ${evalCase.id} created.`, channel: process.env.SLACK_ALERTS_CHANNEL, metadata: { incidentId: incident.id, evalCaseId: evalCase.id } }); externalRefs.push({ provider: "slack", url: message.url, id: message.externalId }); } catch { /* Persisted incident remains authoritative. */ }
  try { const ticket = await suite.issueTracker.createTicket({ title: `[${incident.severity}] ${incident.title}`, description: `${incident.rootCause}\n\nRegression: ${evalCase.id}`, featureId: incident.featureId, ticketId: incident.id, workflowStatus: "todo" }); externalRefs.push({ provider: "linear", url: ticket.url, id: ticket.identifier }); } catch { /* Provider failure is returned below. */ }
  return NextResponse.json({ ok: true, incident, evalCase, externalRefs, partial: externalRefs.length < 2 });
}
