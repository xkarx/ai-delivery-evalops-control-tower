import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";
import { postAgentHandoffThread, type AgentHandoffThreadResult } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { buildWorkflowHandoffs, persistHandoffThread } from "@/lib/workflow-handoffs";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { persistStructuredRecord, readArtifact, writeArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncState = { sessionId?: string; workflowId?: string; ticketRecords: Array<{ internalId: string; externalId: string; identifier: string; url: string; sourceMode: string }>; notification?: { provider: string; url: string; sourceMode: string }; handoffThread?: AgentHandoffThreadResult; trace?: { url: string; sourceMode: string }; workflowEvent?: { url: string; sourceMode: string }; errors: string[] };

export async function POST() {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const root = path.resolve(process.cwd(), "../..");
  try {
    const existing = await readArtifact<SyncState>("workflowSync");
    const workflow = await readArtifact<{ sessionId?: string; workflowInstanceId?: string; featureId: string; featureTitle?: string; featureBatchId?: string; featureTracks?: Array<{ featureId: string }>; evidenceIds?: string[]; ticketIds?: string[]; engineeringRunIds?: string[]; blockedCampaignId?: string; passedCampaignId?: string; releaseApprovalId?: string; workflow?: { id?: string; phase?: string } ; handoffThread?: AgentHandoffThreadResult }>("workflow");
    if (!workflow) throw new Error("No active workflow was found.");
    if (workflow.workflow?.phase === "awaiting_feature_approval") throw new Error("Human feature approval is required before Linear or Slack delivery writes.");
    const data = await loadDemoState();
    const suite = createConnectorSuite({ env: process.env });
    const state: SyncState = existing && (!existing.sessionId || existing.sessionId === workflow.sessionId) ? existing : { ticketRecords: [], errors: [] };
    state.sessionId = workflow.sessionId;
    state.workflowId = workflow.workflowInstanceId ?? workflow.workflow?.id;
    if (!state.handoffThread && workflow.handoffThread) state.handoffThread = workflow.handoffThread;
    const known = new Set(state.ticketRecords.map((record) => record.internalId));
    const featureIds = new Set([workflow.featureId, ...(workflow.featureTracks ?? []).map((track) => track.featureId)]);
    for (const ticket of data.tickets.filter((item) => featureIds.has(item.featureId))) {
      if (known.has(ticket.id)) continue;
      try {
        const feature = data.features.find((candidate) => candidate.id === ticket.featureId);
        const record = await suite.issueTracker.createTicket({ title: ticket.title, description: ticket.description, featureId: ticket.featureId, ticketId: ticket.id, prdId: `PRD-${ticket.featureId.slice(-4)}`, evidenceIds: feature?.evidenceIds ?? [], owner: ticket.workstream === "experience" ? "PM · Maya" : ticket.workstream === "reliability" ? "TPM · Noah" : "Engineering · Priya", workflowStatus: ticket.status, dependsOn: ticket.dependsOn, skillId: ticket.workstream === "experience" ? "code-implementation" : "implementation-planning", contextPackId: "1.0.0", featureBatchId: workflow.featureBatchId });
        state.ticketRecords.push({ internalId: ticket.id, externalId: record.externalId, identifier: record.identifier, url: record.url, sourceMode: record.sourceMode });
      } catch (error) {
        state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Issue tracker write failed.");
      }
    }
    if (!state.notification) {
      try {
        const notification = await suite.chat.postMessage({ text: `DailyCart workflow delivery records synced for ${[...featureIds].join(", ")}: ${state.ticketRecords.map((record) => record.identifier).join(", ") || "none"}.`, metadata: { source: "dailycart-workflow-sync", featureId: workflow.featureId, featureBatchId: workflow.featureBatchId } });
        state.notification = { provider: notification.provider, url: notification.url, sourceMode: notification.sourceMode };
      } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Slack write failed."); }
    }
    if (!state.handoffThread) {
      try {
        const handoffThread = await postAgentHandoffThread(
          suite.chat,
          buildWorkflowHandoffs({
            workflowId: workflow.workflow?.id ?? "PROJ-0101",
            featureId: workflow.featureId,
            featureTitle: workflow.featureTitle ?? workflow.featureId,
            ticketIds: workflow.ticketIds ?? state.ticketRecords.map((ticket) => ticket.internalId),
            engineeringRunIds: workflow.engineeringRunIds ?? [],
            blockedCampaignId: workflow.blockedCampaignId ?? "EVAL-0001",
            passedCampaignId: workflow.passedCampaignId ?? "EVAL-0002",
            releaseApprovalId: workflow.releaseApprovalId ?? "APR-0102",
            evidenceIds: workflow.evidenceIds
          }),
          { title: `DailyCart workflow ${workflow.workflow?.id ?? "PROJ-0101"}` }
        );
        state.handoffThread = handoffThread;
        await persistHandoffThread(root, handoffThread);
      } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Agent handoff write failed."); }
    }
    if (!state.trace) {
      try {
        const traceId = `dailycart-${(workflow.workflowInstanceId ?? workflow.workflow?.id ?? workflow.sessionId ?? String(Date.now())).toLowerCase()}`;
        const trace = await suite.trace.startTrace({ id: traceId, name: "DailyCart V1 delivery workflow", sessionId: workflow.sessionId, input: { featureId: workflow.featureId, ticketIds: data.tickets.map((ticket) => ticket.id) }, metadata: { source: "control-tower-workflow-sync", mode: process.env.INTEGRATION_MODE ?? "mock", sessionId: workflow.sessionId, workflowId: workflow.workflowInstanceId }, tags: ["dailycart", "delivery", "v1"] });
        state.trace = { url: trace.url, sourceMode: trace.sourceMode };
        for (const run of data.runs.filter((candidate) => Boolean(candidate.featureId && featureIds.has(candidate.featureId)))) await suite.trace.addObservation({ id: run.traceId, traceId: trace.externalId, name: `${run.agent}:${run.skillId ?? "role-contract"}`, input: { contextPackId: run.contextPackId, evidenceIds: run.citedEvidenceIds, ticketIds: run.ticketIds }, output: { status: run.status, steps: run.steps, reasoningSummary: run.reasoningSummary }, metadata: { runId: run.id, skillId: run.skillId, skillVersion: run.skillVersion, latencyMs: run.latencyMs, costUsd: run.costUsd, sourceMode: run.sourceMode }, startedAt: run.startedAt, endedAt: run.finishedAt });
        const reviews = await readArtifact<{ agentEvals?: Array<{ id: string; runId: string; criterion: string; score: number; passed: boolean; rationale: string }> }>("workflowReviews");
        for (const evaluation of reviews?.agentEvals ?? []) await suite.trace.addScore({ traceId: trace.externalId, name: `${evaluation.runId}_${evaluation.id}`.slice(0, 120), value: evaluation.score, comment: `${evaluation.criterion}: ${evaluation.rationale}` });
        try { await suite.trace.addScore({ traceId: trace.externalId, name: "workflow_completed", value: true, comment: "Agent outputs, evaluations, approvals, tickets, and delivery records are linked." }); } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Trace score write failed."); }
      } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Trace write failed."); }
    }
    if (!state.workflowEvent) {
      try {
        const event = await suite.workflow.emit({ id: `delivery-${workflow.workflowInstanceId ?? workflow.sessionId ?? Date.now()}`, name: "dailycart/workflow.completed", data: { sessionId: workflow.sessionId, workflowId: workflow.workflowInstanceId, featureId: workflow.featureId, ticketIds: data.tickets.filter((ticket) => ticket.featureId === workflow.featureId).map((ticket) => ticket.id), phase: "ready_to_release" } });
        state.workflowEvent = { url: event.url, sourceMode: event.sourceMode };
      } catch (error) { state.errors.push(error instanceof ConnectorError ? `${error.provider}: ${error.message}` : "Workflow event write failed."); }
    }
    try {
      const selectedFeature = data.features.find((feature) => feature.id === workflow.featureId);
      await persistStructuredRecord("features", workflow.featureId, selectedFeature ?? { title: workflow.featureTitle, featureBatchId: workflow.featureBatchId });
      await persistStructuredRecord("workflow_runs", workflow.workflowInstanceId ?? workflow.workflow?.id ?? `workflow-${Date.now()}`, { workflowType: "dailycart_delivery", sessionId: workflow.sessionId, status: "succeeded", featureId: workflow.featureId, phase: "ready_to_release", ticketIds: state.ticketRecords.map((record) => record.internalId), traceUrl: state.trace?.url });
      for (const ticket of state.ticketRecords) await persistStructuredRecord("external_references", `${ticket.internalId}:${ticket.identifier}`, ticket);
    } catch (error) { state.errors.push(error instanceof Error ? `supabase-storage: ${error.message}` : "Supabase workflow state write failed."); }
    await writeArtifact("workflowSync", state);
    return NextResponse.json({ ok: state.errors.length === 0, partial: state.errors.length > 0 && state.ticketRecords.length > 0, sync: state });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Workflow records could not be synchronized.", detail: error instanceof Error ? error.message : "Unexpected synchronization error." }, { status: 502 });
  }
}
