import { NextResponse } from "next/server";
import { createConnectorSuite } from "@dailycart/connectors";
import { agentRunSchema, assertDemoState, evalCaseSchema, incidentSchema, type EvalCase } from "@dailycart/schemas";
import { requireOperatorOrWorkflowService } from "@/lib/operator-auth";
import { loadDemoState } from "@/lib/load-demo-state";
import { persistStructuredRecord, readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { requestSessionId } from "@/lib/demo-session";
import { createIncidentNumericId } from "@/lib/incident-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncidentActionResult = {
  ok: true;
  sessionId: string;
  incident: unknown;
  evalCase: unknown;
  run: unknown;
  externalRefs: Array<{ provider: string; url: string; id: string }>;
  partial: boolean;
};

export async function POST(request: Request) {
  const denied = await requireOperatorOrWorkflowService(request); if (denied) return denied;
  const sessionId = requestSessionId(request);
  if (!sessionId) return NextResponse.json({ ok: false, message: "A signed demo session is required." }, { status: 409 });
  const actionId = request.headers.get("x-dailycart-action-id")?.trim();
  if (actionId) {
    const records = await readArtifact<Record<string, { value?: IncidentActionResult }>>("structuredRecords", sessionId);
    const existing = records?.[`incident_action_results:${actionId}`]?.value;
    if (existing?.ok) return NextResponse.json({ ...existing, reused: true });
  }
  const body = await request.json().catch(() => ({})) as { title?: string; rootCause?: string; severity?: string; featureId?: string };
  if (!body.title?.trim() || !body.rootCause?.trim()) return NextResponse.json({ ok: false, message: "Title and root cause are required." }, { status: 400 });
  const data = await loadDemoState(sessionId);
  // Timestamp + bounded numeric entropy keeps schema-safe decimal IDs even after
  // many incident generations. Re-parsing and concatenating prior IDs eventually
  // produced scientific notation (for example, `1.7e+27`) and failed validation.
  const numericId = createIncidentNumericId();
  const at = new Date().toISOString();
  const incident = incidentSchema.parse({ id: `INC-${numericId}`, featureId: body.featureId ?? "FEAT-0001", title: body.title, severity: body.severity ?? "SEV-3", status: "open", detectedAt: at, rootCause: body.rootCause, regressionCaseId: `EVALCASE-${numericId}`, sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "simulated" });
  const evalCase = evalCaseSchema.parse({ id: incident.regressionCaseId, datasetVersion: `dailycart-incidents@${at.slice(0, 10)}`, category: "regression", input: { incidentId: incident.id, featureId: incident.featureId, rootCause: incident.rootCause }, expected: { mustDetectRegression: true }, critical: false, sourceMode: incident.sourceMode });
  const authored = await readArtifact<EvalCase[]>("evalAuthoredCases", sessionId) ?? []; await writeArtifact("evalAuthoredCases", [...authored, evalCase], sessionId);
  const suite = createConnectorSuite({ env: process.env });
  const externalRefs: Array<{ provider: string; url: string; id: string }> = [];
  const toolCalls: Array<{ name: string; provider: string; status: "succeeded" | "failed"; detail: string; externalId?: string; url?: string }> = [];
  try {
    const message = await suite.chat.postMessage({ text: `DailyCart incident ${incident.id}: ${incident.title}. Regression case ${evalCase.id} created.`, channel: process.env.SLACK_ALERTS_CHANNEL, metadata: { incidentId: incident.id, evalCaseId: evalCase.id } });
    externalRefs.push({ provider: "slack", url: message.url, id: message.externalId });
    toolCalls.push({ name: "post-incident-alert", provider: "slack", status: "succeeded", detail: `Posted ${incident.id} to the configured incident channel.`, externalId: message.externalId, url: message.url });
  } catch (error) {
    toolCalls.push({ name: "post-incident-alert", provider: "slack", status: "failed", detail: error instanceof Error ? error.message : "Slack incident notification failed." });
  }
  try {
    const ticket = await suite.issueTracker.createTicket({ title: `[${incident.severity}] ${incident.title}`, description: `${incident.rootCause}\n\nRegression: ${evalCase.id}`, featureId: incident.featureId, ticketId: incident.id, workflowStatus: "todo" });
    externalRefs.push({ provider: "linear", url: ticket.url, id: ticket.identifier });
    toolCalls.push({ name: "create-incident-follow-up", provider: "linear", status: "succeeded", detail: `Created follow-up ${ticket.identifier} for ${incident.id}.`, externalId: ticket.identifier, url: ticket.url });
  } catch (error) {
    toolCalls.push({ name: "create-incident-follow-up", provider: "linear", status: "failed", detail: error instanceof Error ? error.message : "Linear incident follow-up failed." });
  }
  const feature = data.features.find((item) => item.id === incident.featureId) ?? data.features[0];
  const run = agentRunSchema.parse({
    id: `RUN-${numericId}`,
    agent: "incident",
    status: toolCalls.some((call) => call.status === "failed") ? "blocked" : "succeeded",
    startedAt: at,
    finishedAt: new Date().toISOString(),
    featureId: incident.featureId,
    ticketIds: [],
    traceId: `trace-incident-${numericId}`,
    skillId: "incident-to-regression",
    skillVersion: "1.0.0",
    contextPackId: "1.0.0",
    citedEvidenceIds: feature?.evidenceIds ?? [],
    reasoningSummary: `The production signal was classified as ${incident.severity}. ${incident.id} was converted into regression case ${evalCase.id} so the failure becomes executable release protection rather than an unlinked incident note.`,
    toolCalls,
    costUsd: 0,
    latencyMs: Math.max(0, Date.now() - Date.parse(at)),
    retries: 0,
    steps: [
      { name: "Classify production signal", status: "succeeded", durationMs: 0, detail: `${incident.title} was classified as ${incident.severity}.` },
      { name: "Create regression protection", status: "succeeded", durationMs: 0, detail: `${evalCase.id} captures the measured root cause.` },
      { name: "Coordinate follow-up", status: toolCalls.some((call) => call.status === "failed") ? "blocked" : "succeeded", durationMs: 0, detail: externalRefs.length ? `Created ${externalRefs.length} external follow-up record(s).` : "External follow-up providers did not accept a write." }
    ],
    sourceMode: incident.sourceMode
  });
  const next = assertDemoState({
    ...data,
    incidents: [incident, ...data.incidents.filter((item) => item.id !== incident.id)],
    runs: [run, ...data.runs.filter((item) => item.id !== run.id)],
    lineage: [{ id: `LIN-${numericId}`, sourceType: "incident", sourceId: incident.id, relationship: "created_regression_case", targetType: "eval_case", targetId: evalCase.id, createdAt: at, metadata: { sessionId, runId: run.id } }, ...data.lineage],
    activity: [{ at, type: "incident", title: "Production incident declared", detail: `${incident.id} created ${evalCase.id} through ${run.id}.`, entityId: incident.id }, ...data.activity]
  });
  await writeArtifact("demoState", next, sessionId);
  await persistStructuredRecord("workflow_runs", run.id, { ...run, sessionId, incidentId: incident.id, evalCaseId: evalCase.id }, sessionId);
  await persistStructuredRecord("incidents", incident.id, { ...incident, sessionId, runId: run.id, externalRefs }, sessionId);
  const result: IncidentActionResult = { ok: true, sessionId, incident, evalCase, run, externalRefs, partial: externalRefs.length < 2 };
  if (actionId) await persistStructuredRecord("incident_action_results", actionId, result, sessionId);
  return NextResponse.json(result);
}
