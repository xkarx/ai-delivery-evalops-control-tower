"use client";

import { TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeclareIncident() {
  const [open, setOpen] = useState(false); const [title, setTitle] = useState("Checkout recovery event duplicated"); const [rootCause, setRootCause] = useState("Recovery instrumentation registered twice after a mobile viewport transition."); const [working, setWorking] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  async function submit() {
    setWorking(true); setMessage("");
    try {
      const response = await fetch("/api/incidents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, rootCause, severity: "SEV-3", featureId: "FEAT-0001" }) });
      const payload = await response.json() as { ok?: boolean; message?: string; detail?: string; incident?: { id: string; regressionCaseId?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.detail ?? payload.message ?? "Incident creation failed.");
      setMessage(`${payload.incident?.id} created · ${payload.incident?.regressionCaseId} regression case linked.`); setOpen(false); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Incident creation failed."); }
    finally { setWorking(false); }
  }
  return <div className="incident-action"><button className="button primary" onClick={() => setOpen(true)}><TriangleAlert size={15} /> Declare incident</button>{open && <div className="incident-form panel"><header><b>Declare production incident</b><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close incident form"><X size={16} /></button></header><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Root cause<textarea value={rootCause} onChange={(event) => setRootCause(event.target.value)} /></label><button className="button primary" onClick={() => void submit()} disabled={working || !title.trim() || !rootCause.trim()}>{working ? "Creating…" : "Create incident and regression"}</button></div>}{message && <small role="status">{message}</small>}</div>;
}
