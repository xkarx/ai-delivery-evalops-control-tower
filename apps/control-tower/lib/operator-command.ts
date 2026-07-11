import { ConnectorError, createConnectorSuite } from "@dailycart/connectors";

export type OperatorCommandResult = { ok: boolean; reply: string; url?: string; sourceMode?: string };

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
    if (lower === "status" || lower === "health" || lower === "check status") {
      const suite = createConnectorSuite({ env: process.env });
      const checks = await Promise.all([suite.codeHost, suite.chat, suite.issueTracker, suite.trace, suite.productAnalytics, suite.workflow, suite.deployment].map((adapter) => adapter.healthCheck()));
      const unhealthy = checks.filter((check) => check.status !== "healthy");
      return { ok: unhealthy.length === 0, reply: unhealthy.length === 0 ? `All ${checks.length} connected providers are healthy.` : `${checks.filter((check) => check.status === "healthy").length}/${checks.length} providers healthy. ${unhealthy.map((check) => `${check.provider}: ${check.status}`).join("; ")}` };
    }
    const endpoint = lower === "run workflow" || lower === "start workflow" ? "/api/workflow/run"
      : lower === "approve release" || lower === "approve" ? "/api/workflow/approve"
        : lower === "sync delivery" || lower === "sync" ? "/api/workflow/sync" : undefined;
    if (endpoint) {
      const response = await fetch(`${baseUrl(requestUrl)}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: endpoint.endsWith("approve") ? JSON.stringify({ reviewer: "operator", rationale: "Approved from operator command after the corrected evaluation passed." }) : undefined, cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; detail?: string; message?: string; workflow?: { phase?: string; passedCampaignId?: string }; sync?: { ticketRecords?: Array<{ identifier: string }>; errors?: string[] } };
      if (!response.ok || payload.ok === false) return { ok: false, reply: payload.detail ?? payload.message ?? `${endpoint} failed.` };
      if (payload.workflow) return { ok: true, reply: `${endpoint.includes("approve") ? "Release approved" : "Workflow executed"}${payload.workflow.passedCampaignId ? `; ${payload.workflow.passedCampaignId} passed` : ""}${payload.workflow.phase ? `; phase ${payload.workflow.phase}` : ""}.` };
      return { ok: true, reply: `Delivery sync completed${payload.sync?.ticketRecords?.length ? ` for ${payload.sync.ticketRecords.map((ticket) => ticket.identifier).join(", ")}` : ""}${payload.sync?.errors?.length ? `. Warnings: ${payload.sync.errors.join("; ")}` : "."}` };
    }
    const ticketMatch = normalized.match(/^(?:create|open|file)\s+(?:a\s+)?ticket\s*[:\-]\s*(.+)$/i);
    if (ticketMatch) {
      const title = ticketMatch[1].trim();
      const ticket = await createConnectorSuite({ env: process.env }).issueTracker.createTicket({ title, description: `Created from operator command: ${normalized}`, featureId: "FEAT-0001", ticketId: `CMD-${Date.now()}`, dependsOn: [] });
      return { ok: true, reply: `Ticket ${ticket.identifier} created: ${ticket.title}.`, url: ticket.url, sourceMode: ticket.sourceMode };
    }
    return { ok: false, reply: "I did not recognize that command. Try ‘run workflow’, ‘approve release’, ‘create ticket: Fix checkout’, ‘sync delivery’, or ‘status’." };
  } catch (error) {
    const detail = error instanceof ConnectorError ? `${error.provider}: ${error.message}` : error instanceof Error ? error.message : "Operator command failed.";
    return { ok: false, reply: detail };
  }
}
