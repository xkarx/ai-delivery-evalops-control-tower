"use client";

import { ChevronDown, ChevronUp, CircleHelp, RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";

type WorkflowStatus = { started: boolean; featureId?: string; featureTitle?: string; phase: string; revision: number; sourceMode: string; currentAgent: string; nextAction: string; agentReasoning?: Record<string, { model: string; summary: string; sourceMode: string }>; history: Array<{ id: string; at: string; from: string | null; to: string; actor: string; reason: string; entityIds: string[] }> };

const phaseLabels: Record<string, string> = {
  not_started: "Not started",
  draft: "Company context",
  planning: "Delivery planning",
  delivery: "Product build",
  evaluation: "Preview evaluation",
  blocked: "Blocked for correction",
  awaiting_release_approval: "Human release approval",
  ready_to_release: "Ready to release",
  released: "Released"
};

export function WorkflowConsole() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState<WorkflowStatus>();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [working, setWorking] = useState(false);

  async function refresh(): Promise<void> {
    const response = await fetch("/api/workflow/status", { cache: "no-store" });
    if (response.ok) setStatus(await response.json() as WorkflowStatus);
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, []);

  async function ask(): Promise<void> {
    if (!question.trim()) return;
    setWorking(true);
    try {
      const response = await fetch("/api/workflow/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const payload = await response.json() as { answer?: string; message?: string };
      setAnswer(payload.answer ?? payload.message ?? "No answer available.");
    } finally { setWorking(false); }
  }

  const fallback: WorkflowStatus = { started: false, phase: "not_started", revision: 0, sourceMode: "deterministic-fallback", currentAgent: "operator", nextAction: "Start the workflow from Company data.", history: [], agentReasoning: {} };
  const current: WorkflowStatus = status ?? fallback;
  const reasoning = current.agentReasoning?.[current.currentAgent] ?? current.agentReasoning?.pm;
  return <aside className={`workflow-console panel ${open ? "open" : "collapsed"}`}><header><div><p className="eyebrow">Follow along</p><h2>Delivery control</h2></div><button className="icon-button" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "Collapse workflow console" : "Expand workflow console"}>{open ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button></header>{open && <><div className="workflow-console-status"><span className="status-dot" /><div><b>{phaseLabels[current.phase] ?? current.phase}</b><small>{current.currentAgent} · revision {current.revision} · {current.sourceMode}</small></div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh workflow status"><RefreshCw size={14} /></button></div>{reasoning && <div className="workflow-ai-summary"><b>AI summary · {reasoning.model}</b><p>{reasoning.summary}</p><small>{reasoning.sourceMode}</small></div>}<div className="workflow-next"><b>Next action</b><p>{current.nextAction}</p></div><div className="workflow-history">{current.history.slice(-6).map((event) => <div key={event.id}><span>{event.id}</span><div><b>{phaseLabels[event.to] ?? event.to}</b><p>{event.reason}</p><small>{event.actor}</small></div></div>)}</div><div className="workflow-question"><label htmlFor="workflow-question"><CircleHelp size={14} /> Ask this workflow</label><div><input id="workflow-question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="Why was this feature selected?" /><button className="button primary" type="button" onClick={() => void ask()} disabled={working}><Send size={13} /></button></div>{answer && <p role="status">{answer}</p>}</div></>}</aside>;
}
