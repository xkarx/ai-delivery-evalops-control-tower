"use client";

import { Check, Loader2, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";

type WorkflowResponse = { reused?: boolean; message?: string; detail?: string; workflow?: { featureTitle: string; passedCampaignId: string; releaseApprovalId: string; phase?: string } };

export function WorkflowAction() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<WorkflowResponse["workflow"]>();
  const [message, setMessage] = useState("");
  const [approved, setApproved] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [synced, setSynced] = useState(false);
  async function runWorkflow() {
    setState("running");
    setMessage("Running PM → TPM → engineering → eval…");
    try {
      const response = await fetch("/api/workflow/run", { method: "POST" });
      const payload = await response.json() as WorkflowResponse;
      if (!response.ok || !payload.workflow) throw new Error(payload.detail ?? payload.message ?? "Workflow could not be started.");
      setResult(payload.workflow); setApproved(payload.workflow.phase === "ready_to_release" || payload.workflow.phase === "released"); setDeployed(payload.workflow.phase === "released"); setState("done");
      setMessage(`${payload.reused ? "Existing run loaded" : "Workflow completed"}: release approval is pending.`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Workflow could not be started."); }
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
      const payload = await response.json() as { ok?: boolean; partial?: boolean; sync?: { ticketRecords: Array<{ identifier: string }>; errors: string[] }; message?: string; detail?: string };
      if (!response.ok || (!payload.ok && !payload.partial)) throw new Error(payload.detail ?? payload.message ?? "Workflow sync failed.");
      setSynced(true); setState("done"); setMessage(`${payload.sync?.ticketRecords.map((ticket) => ticket.identifier).join(", ") || "No tickets"} synced${payload.sync?.errors.length ? ` · ${payload.sync.errors.join("; ")}` : ""}`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Workflow sync failed."); }
  }
  return <span className={`workflow-action ${state}`}>
    <button className="button primary" type="button" onClick={runWorkflow} disabled={state === "running"}>
      {state === "running" ? <Loader2 size={15} className="spin" /> : state === "done" ? <Check size={15} /> : state === "error" ? <ShieldAlert size={15} /> : <Play size={15} />}
      {state === "running" ? "Running workflow…" : state === "done" ? "Workflow complete" : state === "error" ? "Retry workflow" : "Start workflow"}
    </button>
    {message && <small role="status">{message}</small>}
    {result && <small className="workflow-result">{result.featureTitle} · {result.passedCampaignId} passed · {approved ? `${result.releaseApprovalId} approved` : `${result.releaseApprovalId} pending`}</small>}
    {result && !approved && <button className="button secondary workflow-approve" type="button" onClick={approveRelease} disabled={state === "running"}>Approve release</button>}
    {result && approved && !deployed && <button className="button primary workflow-approve" type="button" onClick={deployRelease} disabled={state === "running"}>Deploy approved release</button>}
    {result && approved && !synced && <button className="button secondary workflow-approve" type="button" onClick={syncDelivery} disabled={state === "running"}>Sync delivery records</button>}
  </span>;
}
