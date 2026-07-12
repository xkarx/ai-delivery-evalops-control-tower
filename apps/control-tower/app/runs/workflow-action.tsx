"use client";

import { AlertTriangle, Check, Clock3, ExternalLink, Loader2, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AvailableWorkflowAction, WorkflowAction, WorkflowCommand } from "@dailycart/schemas";

type Status = {
  started: boolean; sessionId?: string; workflowId?: string; phase: string; nextAction: string;
  activeAction?: WorkflowAction; availableActions?: AvailableWorkflowAction[];
  recommendations?: Array<{ id: string; title: string; score: number; confidence: number; problem: string }>;
  previews?: Array<{ featureId: string; deploymentUrl: string; commitSha: string; pullRequestUrl: string; sourceMode: string }>;
  previewEvaluations?: Array<{ featureId: string; targetUrl: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; detail: string }> }>;
  previewAllPassed?: boolean; previewError?: { code: string; detail?: string };
  providerRecords?: { ticketRecords?: Array<{ identifier: string; url: string }>; notification?: { url: string }; trace?: { url: string }; workflowEvent?: { url: string }; errors?: string[] };
};

const phaseLabels: Record<string, string> = {
  queued: "Queued", starting: "Starting durable workflow", context: "Retrieving company context", awaiting_feature_approval: "Waiting for feature approval",
  planning: "Planning delivery", provider_sync: "Synchronizing provider records", building_preview: "Building product previews", waiting_vercel: "Waiting for Vercel",
  preview_ready: "Previews ready", correcting_preview: "Correcting blocked preview", awaiting_release_approval: "Waiting for release approval", deploying: "Deploying approved release",
  released: "Production release complete", failed: "Workflow action failed"
};

export function WorkflowAction() {
  const [status, setStatus] = useState<Status>();
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/workflow/status", { cache: "no-store" });
    if (response.ok) setStatus(await response.json() as Status);
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2_000); return () => window.clearInterval(timer); }, [refresh]);

  async function execute(command: WorkflowCommand) {
    setRequesting(true); setNotice("");
    try {
      const response = await fetch("/api/workflow/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command, sessionId: status?.sessionId }) });
      const payload = await response.json() as { ok?: boolean; actionId?: string; detail?: string; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.detail ?? payload.message ?? "Workflow action could not be queued.");
      setNotice(`${payload.actionId} queued. Progress is durable and will survive refresh.`); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Workflow action failed."); }
    finally { setRequesting(false); }
  }

  const action = status?.activeAction;
  const busy = requesting || action?.status === "queued" || action?.status === "running";
  const available = status?.availableActions?.[0] ?? (!status?.started ? { command: "analyze" as const, label: "Analyze opportunities", enabled: true } : undefined);
  const icon = busy ? <Loader2 size={15} className="spin" /> : available?.command === "retry" ? <RotateCcw size={15} /> : status?.phase === "released" ? <Check size={15} /> : <Play size={15} />;

  return <section className={`guided-execution ${action?.status ?? "idle"}`} aria-label="Guided workflow execution">
    <div className="guided-execution-head">
      <div><span className="guide-kicker"><Clock3 size={12} /> Live execution</span><strong>{phaseLabels[action?.phase ?? status?.phase ?? "queued"] ?? action?.message ?? "Ready to analyze"}</strong><small>{action?.message ?? status?.nextAction ?? "Start from company context."}</small></div>
      {available ? <button className="button primary" type="button" onClick={() => void execute(available.command)} disabled={busy || !available.enabled}>{icon}{busy ? "Working…" : available.label}</button> : status?.phase === "released" ? <span className="source-label"><Check size={12} /> Released</span> : null}
    </div>
    {action && <div className="guided-progress" aria-label={`${action.progress}% complete`}><i style={{ width: `${action.progress}%` }} /></div>}
    {action?.error && <div className="guided-error" role="alert"><AlertTriangle size={15} /><div><b>{action.error.code}</b><p>{action.error.detail}</p></div></div>}
    {notice && <small className="guided-notice" role="status">{notice}</small>}
    {action?.steps?.length ? <div className="guided-timeline">{action.steps.map((step) => <article key={step.id} className={step.status}><span>{step.status === "succeeded" ? <Check size={12} /> : <Loader2 size={12} className={step.status === "running" ? "spin" : ""} />}</span><div><b>{step.label}</b><p>{step.detail}</p><small>{[step.agent, step.skillId, step.provider].filter(Boolean).join(" · ")}</small></div></article>)}</div> : null}
    {status?.recommendations?.length ? <div className="workflow-recommendations"><b>PM-ranked feature tracks</b>{status.recommendations.map((item, index) => <article key={item.id}><span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.id} · {item.score}/100 · {Math.round(item.confidence * 100)}% confidence</small><p>{item.problem}</p></div></article>)}</div> : null}
    {status?.previewError && <div className="guided-error"><AlertTriangle size={15} /><div><b>{status.previewError.code}</b><p>{status.previewError.detail}</p></div></div>}
    {status?.previews?.length ? <div className="external-sync-links"><b>Current product builds</b>{status.previews.map((build) => <div key={build.featureId}><span>{build.featureId} · {build.commitSha.slice(0, 7)}</span><a href={build.deploymentUrl} target="_blank" rel="noreferrer">Preview <ExternalLink size={10} /></a><a href={build.pullRequestUrl} target="_blank" rel="noreferrer">PR <ExternalLink size={10} /></a></div>)}</div> : null}
    {status?.previewEvaluations?.length ? <div className="preview-eval-detail"><b>Preview evaluation evidence</b>{status.previewEvaluations.map((evaluation) => <article key={evaluation.targetUrl}><strong>{evaluation.featureId} · {evaluation.score}/100 · {evaluation.passed ? "passed" : "blocked"}</strong>{evaluation.checks.map((check) => <p key={check.name} className={check.passed ? "passed" : "failed"}>{check.passed ? "✓" : "×"} {check.name}: {check.detail}</p>)}</article>)}</div> : null}
  </section>;
}
