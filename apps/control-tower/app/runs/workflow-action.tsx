"use client";

import { AlertTriangle, Check, Clock3, ExternalLink, Loader2, Play, RotateCcw, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AvailableWorkflowAction, ProviderActivity, WorkflowAction, WorkflowCommand, WorkflowPresentation } from "@dailycart/schemas";
import { shouldRecoverWorkflowAction } from "@/lib/workflow-recovery";

type Status = {
  started: boolean; sessionId?: string; workflowId?: string; phase: string; nextAction: string;
  activeAction?: WorkflowAction; availableActions?: AvailableWorkflowAction[];
  recommendations?: Array<{ id: string; title: string; score: number; confidence: number; problem: string }>;
  previews?: Array<{ featureId: string; deploymentUrl: string; commitSha: string; pullRequestUrl: string; sourceMode: string }>;
  previewEvaluations?: Array<{ featureId: string; targetUrl: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; detail: string }> }>;
  previewAllPassed?: boolean; previewError?: { code: string; detail?: string };
  providerRecords?: { ticketRecords?: Array<{ identifier: string; url: string }>; notification?: { url: string }; trace?: { url: string }; workflowEvent?: { url: string }; errors?: string[] };
  providerActivity?: ProviderActivity[]; presentation?: WorkflowPresentation;
  activeAgent?: { role: string; skillId?: string; skillVersion?: string; runId?: string; task: string; evidenceIds?: string[]; reasoningSummary?: string; model?: string; latencyMs: number; costUsd: number; status: string; evaluations?: Array<{ criterion: string; score: number; passed: boolean; rationale: string; mode: string }> };
};

const phaseLabels: Record<string, string> = {
  queued: "Waiting for execution worker", starting: "Starting workflow", context: "Retrieving company context", agent_research: "Research Agent is analyzing evidence", awaiting_feature_approval: "Waiting for feature approval",
  planning: "Planning delivery", provider_sync: "Synchronizing provider records", building_preview: "Building product previews", waiting_vercel: "Waiting for Vercel",
  preview_ready: "Previews ready", preview_evaluating: "Running GitHub browser evaluations", correcting_preview: "Correcting blocked preview", awaiting_release_approval: "Waiting for release approval", deploying: "Deploying approved release",
  released: "Production release complete", failed: "Workflow action failed"
};

const phaseEstimate: Record<string, string> = {
  queued: "Expected to start within 15 seconds", starting: "Usually less than 15 seconds", context: "Usually 10–30 seconds", agent_research: "Usually 30–90 seconds",
  planning: "Usually 10–30 seconds", provider_sync: "Usually 30–90 seconds", building_preview: "Usually 1–3 minutes", waiting_vercel: "Usually 1–3 minutes",
  preview_evaluating: "Usually 1–3 minutes per preview", correcting_preview: "Usually 2–5 minutes", awaiting_feature_approval: "Waiting for your decision", awaiting_release_approval: "Waiting for your decision"
};

function age(iso?: string, now = Date.now()): string {
  if (!iso) return "just now";
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}

export function WorkflowAction() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>();
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionLink, setActionLink] = useState("");
  const [now, setNow] = useState(Date.now());
  const workerRequests = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const response = await fetch("/api/workflow/status", { cache: "no-store" });
    if (response.ok) setStatus(await response.json() as Status);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { setNow(Date.now()); void refresh(); }, 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const startRecoveryWorker = useCallback((actionId: string) => {
    if (workerRequests.current.has(actionId)) return;
    workerRequests.current.add(actionId);
    void fetch(`/api/workflow/actions/${actionId}`, { method: "POST" }).catch(() => undefined).finally(() => {
      workerRequests.current.delete(actionId);
    });
  }, []);

  useEffect(() => {
    const action = status?.activeAction;
    if (!action) return;
    setActionLink(`/api/workflow/actions/${action.actionId}`);
    if (shouldRecoverWorkflowAction(action, now)) startRecoveryWorker(action.actionId);
  }, [now, startRecoveryWorker, status?.activeAction]);

  useEffect(() => {
    const action = status?.activeAction;
    if (status?.phase !== "released" || action?.command !== "approve_release" || action.status !== "succeeded") return;
    const timer = window.setTimeout(() => router.push("/runs/summary"), 1_200);
    return () => window.clearTimeout(timer);
  }, [router, status?.activeAction, status?.phase]);

  async function execute(command: WorkflowCommand) {
    setRequesting(true); setNotice("");
    try {
      const response = await fetch("/api/workflow/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command, sessionId: status?.sessionId }) });
      const payload = await response.json() as { ok?: boolean; actionId?: string; statusUrl?: string; detail?: string; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.detail ?? payload.message ?? "Workflow action could not be queued.");
      setActionLink(payload.statusUrl ?? (payload.actionId ? `/api/workflow/actions/${payload.actionId}` : ""));
      setNotice(`${payload.actionId} accepted. Tracking started below.`); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Workflow action failed."); }
    finally { setRequesting(false); }
  }

  const action = status?.activeAction;
  const busy = requesting || action?.status === "queued" || action?.status === "running";
  const available = status?.availableActions?.[0] ?? (!status?.started ? { command: "analyze" as const, label: "Analyze opportunities", enabled: true } : undefined);
  const icon = busy ? <Loader2 size={15} className="spin" /> : available?.command === "retry" ? <RotateCcw size={15} /> : status?.phase === "released" ? <Check size={15} /> : <Play size={15} />;
  const stalled = shouldRecoverWorkflowAction(action, now);

  return <section className={`guided-execution ${action?.status ?? "idle"}`} aria-label="Guided workflow execution">
    <div className="guided-execution-head">
      <div><span className="guide-kicker"><Clock3 size={12} /> Live execution</span><strong>{phaseLabels[action?.phase ?? status?.phase ?? "queued"] ?? action?.message ?? "Ready to analyze"}</strong><small>{action?.message ?? status?.nextAction ?? "Start from company context."}</small></div>
      {available ? <button className="button primary" type="button" onClick={() => void execute(available.command)} disabled={busy || !available.enabled}>{icon}{busy ? "Working…" : available.label}</button> : status?.phase === "released" ? <span className="source-label"><Check size={12} /> Released</span> : null}
    </div>
    {action && <div className="guided-progress" aria-label={`${action.progress}% complete`}><i style={{ width: `${action.progress}%` }} /></div>}
    {action && <div className="action-telemetry">
      <span><b>{action.actionId}</b> · {action.progress}%</span>
      <span>Elapsed {age(action.createdAt, now).replace(" ago", "")}</span>
      <span>Last update {age(action.heartbeatAt, now)}</span>
      <span>{phaseEstimate[action.phase] ?? "Timing depends on the active provider"}</span>
    </div>}
    {stalled && <div className="guided-warning" role="status"><Loader2 size={15} className="spin" /><div><b>Execution worker has not reported progress</b><p>The recovery worker is being started automatically. If it cannot start, this will change to a specific failure instead of waiting indefinitely.</p></div></div>}
    {action?.status === "failed" && action.error && <div className="guided-error" role="alert"><AlertTriangle size={15} /><div><b>{action.error.code}</b><p>{action.error.detail}</p></div></div>}
    {notice && <small className="guided-notice" role="status">{notice}</small>}
    {status?.activeAgent && <article className="live-agent-activity" id="agent-activity"><span className={status.activeAgent.status === "running" ? "running" : "complete"}>{status.activeAgent.status === "running" ? <Loader2 size={14} className="spin" /> : <Check size={14} />}</span><div><small>Active agent</small><b>{status.activeAgent.role} · {status.activeAgent.skillId ?? "workflow coordination"}</b><p>{status.activeAgent.task}</p>{status.activeAgent.reasoningSummary && <blockquote>{status.activeAgent.reasoningSummary}</blockquote>}<div>{status.activeAgent.evidenceIds?.slice(0, 5).map((id) => <a key={id} href={`/lineage?focus=${id}`}>{id}</a>)}<span>{status.activeAgent.model ?? "deterministic contract"}</span><span>{(status.activeAgent.latencyMs / 1000).toFixed(1)}s</span><span>${status.activeAgent.costUsd.toFixed(3)}</span></div>{status.activeAgent.runId && <a className="view-agent-link" href={`#run-${status.activeAgent.runId}`}>View active agent and evaluations</a>}</div></article>}
    {action?.status === "running" && !action.steps.some((step) => step.status === "running") ? <div className="guided-timeline"><article className="running"><span><Loader2 size={12} className="spin" /></span><div><b>{phaseLabels[action.phase] ?? "Workflow step running"}</b><p>{action.message}</p><small>Live heartbeat · {age(action.heartbeatAt, now)}</small></div></article></div> : null}
    {action?.steps?.length ? <div className="guided-timeline">{action.steps.map((step) => <article key={step.id} className={step.status}><span>{step.status === "succeeded" ? <Check size={12} /> : <Loader2 size={12} className={step.status === "running" ? "spin" : ""} />}</span><div><b>{step.label}</b><p>{step.detail}</p>{step.outputSummary && <blockquote>{step.outputSummary}</blockquote>}<small>{[step.agent, step.skillId, step.provider].filter(Boolean).join(" · ")}</small>{step.links?.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={10} /></a>)}</div></article>)}</div> : null}
    {status?.recommendations?.length ? <div className="workflow-recommendations"><b>PM-ranked feature tracks</b>{status.recommendations.map((item, index) => <article key={item.id}><span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.id} · {item.score}/100 · {Math.round(item.confidence * 100)}% confidence</small><p>{item.problem}</p></div></article>)}</div> : null}
    {status?.previewError && <div className="guided-error"><AlertTriangle size={15} /><div><b>{status.previewError.code}</b><p>{status.previewError.detail}</p></div></div>}
    {status?.previews?.length ? <div className="external-sync-links"><b>Current product builds</b>{status.previews.map((build) => <div key={build.featureId}><span>{build.featureId} · {build.commitSha.slice(0, 7)}</span><a href={build.deploymentUrl} target="_blank" rel="noreferrer">Preview <ExternalLink size={10} /></a><a href={build.pullRequestUrl} target="_blank" rel="noreferrer">PR <ExternalLink size={10} /></a></div>)}</div> : null}
    {status?.previewEvaluations?.length ? <div className="preview-eval-detail"><b>Preview evaluation evidence</b>{status.previewEvaluations.map((evaluation) => <article key={evaluation.targetUrl}><strong>{evaluation.featureId} · {evaluation.score}/100 · {evaluation.passed ? "passed" : "blocked"}</strong>{evaluation.checks.map((check) => <p key={check.name} className={check.passed ? "passed" : "failed"}>{check.passed ? "✓" : "×"} {check.name}: {check.detail}</p>)}</article>)}</div> : null}
    {status?.providerActivity?.length ? <section className="provider-activity" id="provider-activity"><div className="section-title"><div><p className="eyebrow">External proof</p><h2>Provider activity</h2></div></div><div className="provider-activity-grid">{status.providerActivity.map((item) => { const url = item.artifactUrl ?? item.dashboardUrl; return <article key={`${item.provider}-${item.kind}-${item.externalId ?? item.label}`} className={item.status}><span className="provider-monogram">{item.provider.slice(0, 2).toUpperCase()}</span><div><small>{item.provider} · {item.kind}</small><b>{item.label}</b><p>{item.status === "unavailable" ? item.error : item.status === "running" ? "Provider action is still running." : "External record is available."}</p>{url ? <a href={url} target="_blank" rel="noreferrer">Open {item.artifactUrl ? "record" : "dashboard"} <ExternalLink size={10} /></a> : <span className="provider-pending">{item.status === "unavailable" ? "Dashboard URL not configured" : "Creating external record…"}</span>}</div></article>; })}</div></section> : null}
    {action && <details className="technical-details"><summary><Wrench size={12} /> Technical details</summary><p>Use the raw action record only for debugging or API inspection.</p><a href={actionLink || `/api/workflow/actions/${action.actionId}`} target="_blank" rel="noreferrer">View raw action JSON <ExternalLink size={10} /></a></details>}
  </section>;
}
