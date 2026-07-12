"use client";

import { Check, Loader2, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";

type WorkflowResponse = { reused?: boolean; message?: string; detail?: string; workflow?: { featureTitle: string; passedCampaignId: string; releaseApprovalId: string; phase?: string; featureBatchId?: string; recommendations?: Array<{ id: string; title: string; score: number; confidence: number; evidenceIds: string[]; problem: string }> ; featureTracks?: Array<{ featureId: string; featureTitle: string; status: string; passedCampaignId: string; releaseApprovalId: string }> } };
type SyncResult = { ticketRecords: Array<{ internalId: string; identifier: string; url: string; sourceMode: string }>; notification?: { provider: string; url: string; sourceMode: string }; trace?: { url: string; sourceMode: string }; workflowEvent?: { url: string; sourceMode: string }; errors: string[] };
type PreviewBuild = { featureId: string; branch: string; commitSha: string; commitUrl: string; pullRequestUrl: string; deploymentUrl: string; deploymentId: string; sourceMode: string };
type PreviewEvaluation = { featureId?: string; passed: boolean; score: number; targetUrl: string; sourceMode: string };
type FeatureRecommendation = { id: string; title: string; score: number; confidence: number; evidenceIds: string[]; problem: string };

export function WorkflowAction() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<WorkflowResponse["workflow"]>();
  const [message, setMessage] = useState("");
  const [approved, setApproved] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncDetails, setSyncDetails] = useState<SyncResult>();
  const [preview, setPreview] = useState<PreviewBuild>();
  const [previews, setPreviews] = useState<PreviewBuild[]>([]);
  const [previewEvals, setPreviewEvals] = useState<PreviewEvaluation[]>([]);
  const [featurePending, setFeaturePending] = useState(false);
  const [recommendations, setRecommendations] = useState<FeatureRecommendation[]>([]);
  async function runWorkflow() {
    setState("running");
    setMessage("Running context → PM → UX → feasibility → TPM → engineering → eval…");
    try {
      const response = await fetch("/api/workflow/run", { method: "POST" });
      const payload = await response.json() as WorkflowResponse & { featureApprovalRequired?: boolean };
      if (!response.ok || !payload.workflow) throw new Error(payload.detail ?? payload.message ?? "Workflow could not be started.");
      setResult(payload.workflow); setRecommendations(payload.workflow.recommendations ?? []); setFeaturePending(Boolean(payload.featureApprovalRequired)); setApproved(payload.workflow.phase === "ready_to_release" || payload.workflow.phase === "released"); setDeployed(payload.workflow.phase === "released"); setState("done");
      setMessage(payload.featureApprovalRequired ? "PM recommendation ready: confirm the selected opportunity before delivery planning." : `${payload.reused ? "Existing run loaded" : "Workflow completed"}: release approval is pending.`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Workflow could not be started."); }
  }
  async function approveFeature() {
    setState("running"); setMessage("Recording human feature-selection approval…");
    try {
      const response = await fetch("/api/workflow/approve-feature", { method: "POST" });
      const payload = await response.json() as WorkflowResponse & { featureApprovalRequired?: boolean };
      if (!response.ok || !payload.workflow) throw new Error(payload.detail ?? payload.message ?? "Feature approval failed.");
      setResult(payload.workflow); setRecommendations(payload.workflow.recommendations ?? recommendations); setFeaturePending(false); setApproved(false); setState("done"); setMessage("Feature tracks approved. TPM planning, engineering, and evaluation are complete; preview evaluation is required before release approval.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Feature approval failed."); }
  }
  async function approveRelease() {
    setState("running"); setMessage("Recording human release approval…");
    try {
      const response = await fetch("/api/workflow/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewer: "operator", rationale: "Approved after corrected eval passed and the release gate is ready." }) });
      const payload = await response.json() as { ok?: boolean; message?: string; detail?: string; workflow?: { phase: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.detail ?? payload.message ?? "Approval failed.");
      setApproved(true); setState("done"); setMessage(`Release approved · phase ${payload.workflow?.phase ?? "ready_to_release"}`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Approval failed."); }
  }
  async function deployRelease() {
    setState("running"); setMessage("Requesting deployment through the configured adapter…");
    try {
      const response = await fetch("/api/workflow/deploy", { method: "POST" });
      const payload = await response.json() as { ok?: boolean; message?: string; detail?: string; deployment?: { sourceMode: string; deployment: { id: string } } };
      if (!response.ok || !payload.ok) throw new Error(payload.detail ?? payload.message ?? "Deployment failed.");
      setDeployed(true); setState("done"); setMessage(`${payload.deployment?.deployment.id ?? "Deployment"} recorded · ${payload.deployment?.sourceMode ?? "provider"}`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Deployment failed."); }
  }
  async function syncDelivery() {
    setState("running"); setMessage("Syncing tickets, Slack status, trace, and workflow event…");
    try {
      const response = await fetch("/api/workflow/sync", { method: "POST" });
      const payload = await response.json() as { ok?: boolean; partial?: boolean; sync?: SyncResult; message?: string; detail?: string };
      if (!response.ok || (!payload.ok && !payload.partial)) throw new Error(payload.detail ?? payload.message ?? "Workflow sync failed.");
      setSyncDetails(payload.sync);
      setSynced(true); setState("done"); setMessage(`${payload.sync?.ticketRecords.map((ticket) => ticket.identifier).join(", ") || "No tickets"} synced${payload.sync?.errors.length ? ` · ${payload.sync.errors.join("; ")}` : ""}`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Workflow sync failed."); }
  }
  async function buildPreview() {
    setState("running"); setMessage("Creating an isolated product branch and preview…");
    try {
      const response = await fetch("/api/workflow/preview", { method: "POST" });
      const payload = await response.json() as { ok?: boolean; build?: PreviewBuild; builds?: PreviewBuild[]; detail?: string; message?: string };
      if (!response.ok || !payload.ok || !payload.build) throw new Error(payload.detail ?? payload.message ?? "Preview build failed.");
      const builds = payload.builds ?? (payload.build ? [payload.build] : []);
      setPreview(payload.build); setPreviews(builds); setMessage(`${builds.length} preview${builds.length === 1 ? "" : "s"} ready · running preview evals…`);
      const evalResponse = await fetch("/api/workflow/preview-eval", { method: "POST" });
      const evalPayload = await evalResponse.json() as { ok?: boolean; evaluations?: PreviewEvaluation[]; detail?: string; message?: string };
      if (!evalResponse.ok || !evalPayload.ok || !evalPayload.evaluations?.length) throw new Error(evalPayload.detail ?? evalPayload.message ?? "Preview evaluation failed.");
      setPreviewEvals(evalPayload.evaluations); setState("done"); setMessage(`All previews evaluated · ${Math.min(...evalPayload.evaluations.map((evaluation) => evaluation.score))}/100 minimum · ${evalPayload.evaluations[0]!.sourceMode}`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Preview build failed."); }
  }
  return <span className={`workflow-action ${state}`}>
    <button className="button primary" type="button" onClick={runWorkflow} disabled={state === "running"}>
      {state === "running" ? <Loader2 size={15} className="spin" /> : state === "done" ? <Check size={15} /> : state === "error" ? <ShieldAlert size={15} /> : <Play size={15} />}
      {state === "running" ? "Running workflow…" : state === "done" ? "Workflow complete" : state === "error" ? "Retry workflow" : "Start workflow"}
    </button>
    {message && <small role="status">{message}</small>}
    {result && <small className="workflow-result">{result.featureTitle} · {featurePending ? "awaiting feature selection" : `${result.passedCampaignId} passed · ${approved ? `${result.releaseApprovalId} approved` : `${result.releaseApprovalId} pending`}`}</small>}
    {recommendations.length > 0 && <div className="workflow-recommendations"><b>PM-ranked feature tracks</b>{recommendations.map((item, index) => <article key={item.id}><span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.id} · {item.score}/100 · {Math.round(item.confidence * 100)}% confidence</small><p>{item.problem}</p></div></article>)}</div>}
    {result && featurePending && <button className="button primary workflow-approve" type="button" onClick={approveFeature} disabled={state === "running"}>Approve feature tracks</button>}
    {result && !featurePending && !approved && <button className="button secondary workflow-approve" type="button" onClick={approveRelease} disabled={state === "running" || !previewEvals.length || !previewEvals.every((evaluation) => evaluation.passed)}>Approve release</button>}
    {result && !preview && <button className="button secondary workflow-approve" type="button" onClick={buildPreview} disabled={state === "running"}>Build product preview</button>}
    {result && approved && !deployed && <button className="button primary workflow-approve" type="button" onClick={deployRelease} disabled={state === "running"}>Deploy approved release</button>}
    {result && approved && !synced && <button className="button secondary workflow-approve" type="button" onClick={syncDelivery} disabled={state === "running"}>Sync delivery records</button>}
    {syncDetails && <div className="external-sync-links" role="status"><b>External records</b><div>{syncDetails.ticketRecords.map((ticket) => <a href={ticket.url} target="_blank" rel="noreferrer" key={ticket.internalId}>{ticket.identifier} ↗</a>)}{syncDetails.notification && <a href={syncDetails.notification.url} target="_blank" rel="noreferrer">{syncDetails.notification.provider} message ↗</a>}{syncDetails.trace && <a href={syncDetails.trace.url} target="_blank" rel="noreferrer">Langfuse trace ↗</a>}{syncDetails.workflowEvent && <a href={syncDetails.workflowEvent.url} target="_blank" rel="noreferrer">Inngest event ↗</a>}</div></div>}
    {preview && <div className="external-sync-links" role="status"><b>Product builds</b>{previews.map((build) => <div key={build.featureId}><span>{build.featureId}</span><a href={build.deploymentUrl} target="_blank" rel="noreferrer">Open preview ↗</a><a href={build.pullRequestUrl} target="_blank" rel="noreferrer">GitHub PR ↗</a><a href={build.commitUrl} target="_blank" rel="noreferrer">Commit {build.commitSha.slice(0, 7)} ↗</a></div>)}</div>}
    {previewEvals.length > 0 && <div className="external-sync-links" role="status"><b>Preview evals</b>{previewEvals.map((evaluation) => <div key={evaluation.targetUrl}><span>{evaluation.featureId ?? "feature"} · {evaluation.score}/100 · {evaluation.sourceMode}</span><a href={evaluation.targetUrl} target="_blank" rel="noreferrer">Evaluated target ↗</a></div>)}</div>}
  </span>;
}
