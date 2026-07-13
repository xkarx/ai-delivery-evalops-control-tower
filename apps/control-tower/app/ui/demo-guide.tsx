"use client";

import { ChevronDown, ChevronRight, CircleHelp, ExternalLink, Info, Pause, Play, Send, ShieldCheck, Waypoints } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderActivity, WorkflowPresentation, WorkflowPresentationStep } from "@dailycart/schemas";
import type { RuntimeMode } from "@/lib/runtime-mode";

const journey: Array<{ id: WorkflowPresentationStep; label: string; href: string; inspect: string }> = [
  { id: "company_context", label: "Company context", href: "/company", inspect: "Browse the evidence pack and inspect the source records agents will cite." },
  { id: "live_agent_analysis", label: "Live agent analysis", href: "/runs#agent-activity", inspect: "Watch each agent execute its skill, cite evidence, and pass its output checks." },
  { id: "ranked_opportunities", label: "Ranked opportunities", href: "/features", inspect: "Compare the ranked problems, supporting evidence, confidence, and unresolved conflicts." },
  { id: "feature_approval", label: "Feature approval", href: "/reviews#feature-gate", inspect: "Review the complete evidence and agent packet before approving delivery work." },
  { id: "delivery_planning", label: "Delivery planning", href: "/delivery", inspect: "Inspect workstreams, owners, dependencies, risks, and readiness checks." },
  { id: "builds", label: "Builds and providers", href: "/delivery#provider-activity", inspect: "Open the Linear tickets, GitHub work, Slack handoff, and Vercel previews." },
  { id: "eval_campaign", label: "Eval campaign", href: "/evals", inspect: "Inspect the blocked browser check, correction, and passing rerun." },
  { id: "release_approval", label: "Release approval", href: "/reviews#release-gate", inspect: "Verify the exact commits, previews, checks, and provider evidence before release." },
  { id: "deployment", label: "Deployment", href: "/releases", inspect: "Open production deployment evidence and release-provider records." },
  { id: "delivery_report", label: "Delivery report", href: "/runs/summary", inspect: "Review the complete delivery timeline, decisions, costs, evals, and external links." },
  { id: "product_outcomes", label: "Product outcomes", href: "/analytics", inspect: "Generate bounded traffic and inspect exposure and funnel outcomes." },
  { id: "incident_learning", label: "Incident learning", href: "/incidents", inspect: "See how an operational failure becomes a ticket and regression case." },
  { id: "lineage", label: "End-to-end lineage", href: "/lineage", inspect: "Trace the complete evidence-to-outcome graph." }
];

type WorkflowStatus = {
  phase: string; sourceMode: string; sessionId?: string; featureTitle?: string;
  presentation?: WorkflowPresentation;
  activeAgent?: { role: string; skillId?: string; runId?: string; task: string; reasoningSummary?: string; model?: string; status: string };
  phaseSummary?: { completed?: string[]; running?: string; inspect?: string; next?: string };
  providerActivity?: ProviderActivity[];
  operator?: { required: boolean; authorized: boolean };
};

function pathnameFor(href: string): string { return href.split("#")[0]!; }

export function DemoGuide({ runtimeMode }: { runtimeMode: RuntimeMode }) {
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [status, setStatus] = useState<WorkflowStatus>();
  const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState("");
  const [passcode, setPasscode] = useState(""); const [authMessage, setAuthMessage] = useState("");
  const previousPhase = useRef<string | undefined>(undefined); const autoNavigating = useRef(false);

  const refresh = useCallback(async () => { const response = await fetch("/api/workflow/status", { cache: "no-store" }).catch(() => undefined); if (response?.ok) setStatus(await response.json() as WorkflowStatus); }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2_000); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => { document.body.classList.toggle("journey-open", open); return () => document.body.classList.remove("journey-open"); }, [open]);
  useEffect(() => {
    const phase = status?.phase; const presentation = status?.presentation;
    if (!phase || !presentation) return;
    const changed = previousPhase.current && previousPhase.current !== phase;
    previousPhase.current = phase;
    if (phase === "failed" || (changed && ["awaiting_feature_approval", "awaiting_release_approval", "released"].includes(phase))) setOpen(true);
    if (!changed || !presentation.autoFollow || presentation.executionAheadBy < 1) return;
    const current = journey.find((step) => step.id === presentation.currentStep);
    if (!current || pathnameFor(current.href) !== pathname) return;
    const timer = window.setTimeout(() => void advance(true), 900);
    return () => window.clearTimeout(timer);
  }, [status?.phase]);

  async function updatePresentation(command: "continue" | "pause" | "resume", reason?: string) {
    const response = await fetch("/api/workflow/presentation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command, sessionId: status?.sessionId, reason }) });
    const payload = await response.json() as { presentation?: WorkflowPresentation };
    if (payload.presentation) setStatus((current) => current ? { ...current, presentation: payload.presentation } : current);
    return payload.presentation;
  }
  async function advance(automatic = false) {
    autoNavigating.current = automatic;
    const next = await updatePresentation("continue");
    const destination = journey.find((step) => step.id === next?.currentStep);
    if (destination) router.push(destination.href);
    window.setTimeout(() => { autoNavigating.current = false; }, 500);
  }
  async function pauseForManualNavigation(href: string) { if (status?.presentation?.autoFollow && !autoNavigating.current) await updatePresentation("pause", "You opened another part of the control tower."); router.push(href); }
  async function resume() { const updated = await updatePresentation("resume"); const current = journey.find((step) => step.id === updated?.currentStep); if (current) router.push(current.href); }
  async function ask() { if (!question.trim()) return; const response = await fetch("/api/workflow/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) }); const payload = await response.json() as { answer?: string }; setAnswer(payload.answer ?? "The workflow has not produced an answer yet."); }
  async function unlock() { const response = await fetch("/api/operator/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) }); const payload = await response.json() as { ok?: boolean; message?: string }; setAuthMessage(payload.message ?? "Access request completed."); if (payload.ok) window.location.reload(); }

  const presentation = status?.presentation; const currentIndex = Math.max(0, journey.findIndex((step) => step.id === presentation?.currentStep));
  const current = journey[currentIndex]!; const next = journey[currentIndex + 1];
  const completed = status?.phaseSummary?.completed ?? [];
  const providers = status?.providerActivity?.filter((item) => item.artifactUrl || item.dashboardUrl).slice(0, 6) ?? [];

  return <aside className={`demo-guide journey-drawer ${open ? "open" : "collapsed"}`} aria-label="Delivery journey">
    <button className="journey-tab" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Journey drawer toggle" : "Open journey"}><Waypoints size={16} /><span>{open ? "Journey open" : "Open journey"}</span><ChevronRight size={15} /></button>
    {open && <div className="journey-content"><header><div><p className="eyebrow"><Waypoints size={12} /> Delivery journey</p><h2>Follow the live story</h2></div><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close journey"><ChevronDown size={17} /></button></header>
      <div className="demo-guide-mode"><span><i className={runtimeMode === "live" ? "live-dot" : "mock-dot"} /><b>{runtimeMode === "live" ? "SYNTHETIC INPUTS · LIVE DELIVERY" : "DETERMINISTIC DEMO"}</b></span><small>Provider links below show exactly which actions are live, simulated, pending, or unavailable.</small></div>
      {runtimeMode === "live" && status?.operator?.required && !status.operator.authorized && <section className="guide-auth"><span className="guide-kicker"><ShieldCheck size={12} /> Operator access</span><p>Unlock provider writes for this browser session.</p><div><input type="password" aria-label="Operator passcode" value={passcode} onChange={(event) => setPasscode(event.target.value)} /><button className="button primary" onClick={() => void unlock()}>Unlock</button></div>{authMessage && <small>{authMessage}</small>}</section>}
      <section className="journey-now"><span className="guide-kicker">Chapter {currentIndex + 1} of {journey.length}</span><b>{current.label}</b><p>{current.inspect}</p><small>Execution: {status?.phase ?? "not started"}{presentation?.executionAheadBy ? ` · ${presentation.executionAheadBy} chapter(s) ready to inspect` : ""}</small></section>
      <div className="journey-controls"><button type="button" onClick={() => presentation?.autoFollow ? void updatePresentation("pause", "Paused by operator") : void resume()}>{presentation?.autoFollow ? <Pause size={12} /> : <Play size={12} />}{presentation?.autoFollow ? "Pause auto-follow" : "Resume live follow"}</button></div>
      <section className="guide-walkthrough"><span className="guide-kicker">Story</span><ol>{journey.map((step, index) => <li key={step.id} className={index === currentIndex ? "current" : presentation?.completedSteps.includes(step.id) ? "visited" : index <= currentIndex ? "visited" : ""}><button type="button" onClick={() => void pauseForManualNavigation(step.href)} disabled={index > currentIndex && index > currentIndex + (presentation?.executionAheadBy ?? 0)}><span>{index + 1}</span>{step.label}</button></li>)}</ol></section>
      {status?.activeAgent && <section className="guide-active-agent"><span className="guide-kicker">Active work</span><b>{status.activeAgent.role} · {status.activeAgent.skillId ?? "workflow coordination"}</b><p>{status.activeAgent.task}</p>{status.activeAgent.reasoningSummary && <small>{status.activeAgent.reasoningSummary}</small>}<Link href={`/runs#${status.activeAgent.runId ? `run-${status.activeAgent.runId}` : "agent-activity"}`}>View active agent <ExternalLink size={10} /></Link></section>}
      {completed.length > 0 && <section className="journey-completed"><span className="guide-kicker">Just completed</span>{completed.slice(-3).map((item) => <p key={item}>✓ {item}</p>)}</section>}
      {providers.length > 0 && <section className="guide-links"><span className="guide-kicker">Live records</span>{providers.map((item) => <a key={`${item.provider}-${item.kind}-${item.externalId ?? item.label}`} href={item.artifactUrl ?? item.dashboardUrl} target="_blank" rel="noreferrer"><span>{item.label}<small>{item.provider} · {item.status}</small></span><ExternalLink size={11} /></a>)}</section>}
      <section><span className="guide-kicker">What happens next</span><p>{next ? `Continue to ${next.label} when you are ready to inspect the next chapter.` : "The complete story is ready for end-to-end inspection."}</p><small className="guide-why"><Info size={13} /> Backend execution may run ahead, but this journey never skips an unviewed chapter.</small></section>
      {next && <button className="guide-next" type="button" onClick={() => void advance(false)} disabled={(presentation?.executionAheadBy ?? 0) < 1}>Continue to {next.label} <ChevronRight size={13} /></button>}
      <section className="guide-ask"><label htmlFor="demo-guide-question"><CircleHelp size={13} /> Ask this workflow</label><div><input id="demo-guide-question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="Why did this happen?" /><button className="button primary" onClick={() => void ask()} aria-label="Ask workflow"><Send size={12} /></button></div>{answer && <p role="status">{answer}</p>}</section>
    </div>}
  </aside>;
}
