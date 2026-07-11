import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";

export type OperatorCommandResult = { ok: boolean; reply: string; url?: string; sourceMode?: string };

type WorkflowContext = {
  phase?: string;
  featureId?: string;
  featureTitle?: string;
  ticketIds?: string[];
  engineeringRunIds?: string[];
  blockedCampaignId?: string;
  passedCampaignId?: string;
  releaseApprovalId?: string;
  handoffCount?: number;
  handoffSourceMode?: string;
  syncErrors?: string[];
};

async function readJson<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return undefined; }
}

async function loadWorkflowContext(): Promise<WorkflowContext> {
  const root = path.resolve(process.cwd(), "../..");
  const stored = await readJson<{
    phase?: string; featureId?: string; featureTitle?: string; ticketIds?: string[]; engineeringRunIds?: string[];
    blockedCampaignId?: string; passedCampaignId?: string; releaseApprovalId?: string;
    handoffThread?: { messages?: unknown[]; sourceMode?: string };
  }>(path.resolve(root, "artifacts/workflow-run.json"));
  const sync = await readJson<{ errors?: string[] }>(path.resolve(root, "artifacts/workflow-external-sync.json"));
  return {
    phase: stored?.phase,
    featureId: stored?.featureId,
    featureTitle: stored?.featureTitle,
    ticketIds: stored?.ticketIds,
    engineeringRunIds: stored?.engineeringRunIds,
    blockedCampaignId: stored?.blockedCampaignId,
    passedCampaignId: stored?.passedCampaignId,
    releaseApprovalId: stored?.releaseApprovalId,
    handoffCount: stored?.handoffThread?.messages?.length,
    handoffSourceMode: stored?.handoffThread?.sourceMode,
    syncErrors: sync?.errors ?? []
  };
}

function contextSummary(context: WorkflowContext): string {
  const feature = context.featureId ? `${context.featureId}${context.featureTitle ? ` (${context.featureTitle})` : ""}` : "no workflow feature yet";
  const tickets = context.ticketIds?.length ? context.ticketIds.join(", ") : "none";
  const handoffs = context.handoffCount ? `${context.handoffCount} agent handoffs (${context.handoffSourceMode ?? "unknown"})` : "no agent handoff thread yet";
  const warningList = [...new Set(context.syncErrors ?? [])];
  const warnings = warningList.length ? ` Warnings: ${warningList.slice(0, 3).join("; ")}${warningList.length > 3 ? ` (+${warningList.length - 3} more)` : ""}` : "";
  return `Workflow ${context.phase ?? "not started"}; feature ${feature}; tickets ${tickets}; ${handoffs}.${warnings}`;
}

function baseUrl(requestUrl?: string): string {
  if (process.env.APP_URL?.trim()) return process.env.APP_URL.replace(/\/$/, "");
  if (requestUrl) {
    try { return new URL(requestUrl).origin; } catch { /* fall through to the local default */ }
  }
  return "http://localhost:3000";
}

export async function executeOperatorCommand(command: string, requestUrl?: string): Promise<OperatorCommandResult> {
  const normalized = command.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  try {
    if (!normalized) return { ok: false, reply: "Say a command such as ‘run workflow’, ‘create ticket: …’, or ‘status’." };
    const askMatch = normalized.match(/^ask(?:\s+(.+))?$/i);
    if (askMatch) {
      const context = await loadWorkflowContext();
      const question = askMatch[1]?.trim();
      if (!question) return { ok: false, reply: "Use `/dailycart ask <question>`, for example `/dailycart ask what is blocked?`." };
      const lowerQuestion = question.toLowerCase();
      if (/ticket|linear|delivery/.test(lowerQuestion)) return { ok: true, reply: `${contextSummary(context)} Delivery tickets are ${context.ticketIds?.length ? "linked to the workflow" : "not created yet"}.` };
      if (/approval|release|deploy/.test(lowerQuestion)) return { ok: true, reply: `${contextSummary(context)} Release approval: ${context.releaseApprovalId ?? "not requested"}; corrected eval: ${context.passedCampaignId ?? "not run"}.` };
      if (/evidence|feature|why|recommend/.test(lowerQuestion)) return { ok: true, reply: `${contextSummary(context)} The recommendation is evidence-linked through ${context.featureId ?? "the current workflow"}.` };
      if (/agent|slack|handoff|conversation/.test(lowerQuestion)) return { ok: true, reply: `${contextSummary(context)} Agent updates are emitted as one threaded message per persona.` };
      return { ok: true, reply: contextSummary(context) };
    }
    if (lower === "status" || lower === "health" || lower === "check status") {
      const suite = createConnectorSuite({ env: process.env });
      const checks = await Promise.all([suite.codeHost, suite.chat, suite.issueTracker, suite.trace, suite.productAnalytics, suite.workflow, suite.deployment].map((adapter) => adapter.healthCheck()));
      const unhealthy = checks.filter((check) => check.status !== "healthy");
      const context = await loadWorkflowContext();
      const health = unhealthy.length === 0 ? `All ${checks.length} connected providers are healthy.` : `${checks.filter((check) => check.status === "healthy").length}/${checks.length} providers healthy. ${unhealthy.map((check) => `${check.provider}: ${check.status}`).join("; ")}`;
      return { ok: unhealthy.length === 0, reply: `${health} ${contextSummary(context)}` };
    }
    const endpoint = lower === "run workflow" || lower === "start workflow" ? "/api/workflow/run"
      : lower === "approve feature" || lower === "confirm opportunity" ? "/api/workflow/approve-feature"
      : lower === "approve release" || lower === "approve" ? "/api/workflow/approve"
        : lower === "sync delivery" || lower === "sync" ? "/api/workflow/sync" : undefined;
    if (endpoint) {
      const response = await fetch(`${baseUrl(requestUrl)}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: endpoint.endsWith("approve") ? JSON.stringify({ reviewer: "operator", rationale: "Approved from operator command after the corrected evaluation passed." }) : undefined, cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; detail?: string; message?: string; workflow?: { phase?: string; passedCampaignId?: string }; sync?: { ticketRecords?: Array<{ identifier: string }>; errors?: string[] } };
      if (!response.ok || payload.ok === false) return { ok: false, reply: payload.detail ?? payload.message ?? `${endpoint} failed.` };
      if (payload.workflow) return { ok: true, reply: `${endpoint.includes("approve-feature") ? "Feature selection approved" : endpoint.includes("approve") ? "Release approved" : "Workflow executed"}${payload.workflow.passedCampaignId ? `; ${payload.workflow.passedCampaignId} passed` : ""}${payload.workflow.phase ? `; phase ${payload.workflow.phase}` : ""}.` };
      return { ok: true, reply: `Delivery sync completed${payload.sync?.ticketRecords?.length ? ` for ${payload.sync.ticketRecords.map((ticket) => ticket.identifier).join(", ")}` : ""}${payload.sync?.errors?.length ? `. Warnings: ${payload.sync.errors.join("; ")}` : "."}` };
    }
    const ticketMatch = normalized.match(/^(?:create|open|file)\s+(?:a\s+)?ticket\s*[:\-]\s*(.+)$/i);
    if (ticketMatch) {
      const title = ticketMatch[1].trim();
      const ticket = await createConnectorSuite({ env: process.env }).issueTracker.createTicket({ title, description: `Created from operator command: ${normalized}`, featureId: "FEAT-0001", ticketId: `CMD-${Date.now()}`, dependsOn: [] });
      return { ok: true, reply: `Ticket ${ticket.identifier} created: ${ticket.title}.`, url: ticket.url, sourceMode: ticket.sourceMode };
    }
    return { ok: false, reply: "I did not recognize that command. Try ‘run workflow’, ‘approve release’, ‘create ticket: Fix checkout’, ‘sync delivery’, ‘status’, or ‘ask what is blocked?’." };
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Operator command failed.";
    return { ok: false, reply: detail };
  }
}
