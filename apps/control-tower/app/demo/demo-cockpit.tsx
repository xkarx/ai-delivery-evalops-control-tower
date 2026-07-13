"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  FileSearch,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DemoStage, ProviderActivity, WorkflowAction, WorkflowCommand } from "@dailycart/schemas";
import { shouldRecoverWorkflowAction } from "@/lib/workflow-recovery";

type AgentEval = { criterion: string; score: number; passed: boolean; rationale: string; mode: string };
type AgentRun = {
  id: string; agent: string; status: string; skillId?: string; skillVersion?: string;
  contextPackId?: string; citedEvidenceIds?: string[]; reasoningSummary?: string;
  latencyMs: number; costUsd: number; retries: number; traceId?: string; sourceMode?: string;
};
type TimelineItem = { id: string; at: string; kind: string; title: string; detail?: string; actor?: string; status?: string; provider?: string; links?: Array<{ label: string; url: string }> };
type CockpitStatus = {
  started: boolean;
  session: { sessionId: string; workflowId: string; status: string; createdAt: string } | null;
  workflow?: { workflowId: string; phase: string; featureId?: string; featureTitle?: string };
  activeStage: DemoStage;
  stages?: DemoStage[];
  phase: string;
  progress: number;
  activeAction?: WorkflowAction;
  availableActions?: Array<{ command: WorkflowCommand; label: string; enabled: boolean }>;
  activeAgent?: { role: string; runId?: string; skillId?: string; skillVersion?: string; contextPackId?: string; evidenceIds?: string[]; task: string; reasoningSummary?: string; model?: string; sourceMode?: string; latencyMs: number; costUsd: number; retries?: number; status: string; evaluations?: AgentEval[] };
  agentRuns?: AgentRun[];
  agentEvals?: Array<AgentEval & { runId: string }>;
  providerActivity?: ProviderActivity[];
  timeline?: TimelineItem[];
  recommendations?: Array<{ id: string; title: string; score: number; confidence: number; problem: string; evidenceIds?: string[] }>;
  previewEvals?: Array<{ featureId: string; targetUrl: string; passed: boolean; score: number; githubRunUrl?: string; checks: Array<{ name: string; passed: boolean; detail: string }> }>;
  approvalPacket?: { kind: "feature" | "release"; risks?: string[] };
  completionSummary?: { durationMs: number; agents: AgentRun[]; decisions: Array<{ id: string; stage: string; status: string; rationale?: string }>; builds: Array<{ featureId: string; commitSha: string; previewUrl: string; pullRequestUrl: string }>; evals: Array<{ featureId: string; score: number; passed: boolean; targetUrl: string }>; providerActions: ProviderActivity[]; telemetry: { totalCostUsd: number; totalLatencyMs: number; retries: number }; warnings: string[] };
  phaseSummary?: { completed: string[]; running?: string; next: string };
  warnings?: string[];
  operator?: { required: boolean; authorized: boolean };
};

const stages: Array<{ id: DemoStage; short: string; title: string; description: string; href: string }> = [
  { id: "problem_context", short: "01", title: "Problem and context", description: "Inspect synthetic company evidence and the delivery boundary.", href: "/company" },
  { id: "agent_analysis", short: "02", title: "Agent analysis", description: "Research, support, analytics, PM, UX, and feasibility agents execute skills.", href: "/runs" },
  { id: "ranked_opportunities", short: "03", title: "Ranked opportunities", description: "Compare evidence-grounded feature recommendations.", href: "/features" },
  { id: "feature_approval", short: "04", title: "Feature approval", description: "A human accepts the proposed delivery scope.", href: "/reviews#feature-gate" },
  { id: "plan_build", short: "05", title: "Plan and build", description: "TPM plans; providers, branches, PRs, and previews are created.", href: "/delivery" },
  { id: "preview_evals", short: "06", title: "Preview evals", description: "Browser and accessibility checks evaluate exact preview commits.", href: "/evals" },
  { id: "release_approval", short: "07", title: "Release approval", description: "A human reviews current previews and release evidence.", href: "/reviews#release-gate" },
  { id: "deployment_report", short: "08", title: "Deployment report", description: "Production promotion and provider records are summarized.", href: "/runs/summary" },
  { id: "outcomes_learning", short: "09", title: "Outcomes and learning", description: "Observe product activity and turn incidents into regression cases.", href: "/analytics" }
];

const phaseCopy: Record<string, { title: string; detail: string }> = {
  not_started: { title: "Ready to start", detail: "Begin with the company problem and its source evidence." },
  queued: { title: "Waiting for the execution worker", detail: "The action is accepted and will start without another click." },
  starting: { title: "Starting the workflow", detail: "The signed session is being bound to a durable workflow." },
  context: { title: "Retrieving company context", detail: "The evidence pack is being validated and attached to agent inputs." },
  agent_research: { title: "Agents are analyzing evidence", detail: "Each agent run will appear with its skill, evidence, output, and evals." },
  awaiting_feature_approval: { title: "Feature decision required", detail: "Review the ranked recommendations and approve the delivery scope." },
  planning: { title: "Planning delivery", detail: "The approved scope is being decomposed into workstreams and dependencies." },
  provider_sync: { title: "Creating delivery records", detail: "Linear, Slack, Langfuse, Supabase, and Inngest records are being linked." },
  building_preview: { title: "Building two product changes", detail: "GitHub branches, commits, PRs, and Vercel previews are being created." },
  waiting_vercel: { title: "Waiting for Vercel previews", detail: "Evaluation begins only after both exact deployments are READY." },
  preview_evaluating: { title: "Running preview evaluations", detail: "Remote browser and accessibility checks are testing exact commits." },
  correcting_preview: { title: "Correcting a measured failure", detail: "Engineering is changing product code, rebuilding, and rerunning checks." },
  awaiting_release_approval: { title: "Release decision required", detail: "Both current previews passed; inspect the evidence before approval." },
  deploying: { title: "Promoting the approved release", detail: "Release records and provider states are being updated." },
  released: { title: "Delivery complete", detail: "The production release is ready for outcome measurement and learning." },
  failed: { title: "A workflow step failed", detail: "The exact error is preserved. Retry reuses prior records idempotently." }
};

function displayDuration(startedAt?: string): string {
  if (!startedAt) return "0s";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function DemoCockpit() {
  const [status, setStatus] = useState<CockpitStatus>();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmNewSession, setConfirmNewSession] = useState(false);
  const workerRequests = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const response = await fetch("/api/workflow/status", { cache: "no-store" });
    const payload = await response.json() as CockpitStatus;
    setStatus(payload);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2_000);
    const events = new EventSource("/api/workflow/events");
    events.addEventListener("workflow", () => void refresh());
    const operatorAuthorized = () => {
      setNotice("Live actions are unlocked. Start the guided demo when ready.");
      void refresh();
    };
    window.addEventListener("dailycart:operator-auth", operatorAuthorized);
    return () => {
      window.clearInterval(timer);
      events.close();
      window.removeEventListener("dailycart:operator-auth", operatorAuthorized);
    };
  }, [refresh]);

  const startRecoveryWorker = useCallback((actionId: string) => {
    if (workerRequests.current.has(actionId)) return;
    workerRequests.current.add(actionId);
    setNotice("The hosted execution worker did not start on time. Recovery has started automatically for this same action.");
    void fetch(`/api/workflow/actions/${actionId}`, { method: "POST" }).catch(() => undefined).finally(() => {
      workerRequests.current.delete(actionId);
    });
  }, []);

  useEffect(() => {
    const action = status?.activeAction;
    if (shouldRecoverWorkflowAction(action)) startRecoveryWorker(action!.actionId);
  }, [startRecoveryWorker, status?.activeAction]);

  function openOperatorAccess() {
    setNotice("Enter the operator passcode in the access panel to unlock live actions.");
    window.dispatchEvent(new CustomEvent("dailycart:open-operator"));
  }

  async function startNewSession() {
    if (status?.operator?.required && !status.operator.authorized) {
      openOperatorAccess();
      return;
    }
    if (status?.session && !confirmNewSession) {
      setConfirmNewSession(true);
      setNotice("Confirm below to archive this session and create a clean one. Existing provider records stay in audit history.");
      return;
    }
    setWorking(true); setNotice("");
    try {
      const response = await fetch("/api/demo/sessions", { method: "POST" });
      const payload = await response.json() as { ok?: boolean; session?: { sessionId: string }; detail?: string; message?: string; code?: string };
      if (!response.ok || !payload.ok) {
        if (payload.code === "OPERATOR_AUTH_REQUIRED") openOperatorAccess();
        throw new Error(payload.detail ?? payload.message ?? "A new demo session could not be created.");
      }
      setConfirmNewSession(false);
      setNotice(`New session ${payload.session?.sessionId} is ready.`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Session creation failed."); }
    finally { setWorking(false); }
  }

  async function execute(command: WorkflowCommand) {
    setWorking(true); setNotice("");
    try {
      const response = await fetch("/api/workflow/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command, sessionId: status?.session?.sessionId }) });
      const payload = await response.json() as { ok?: boolean; reused?: boolean; actionId?: string; detail?: string; message?: string; code?: string };
      if (!response.ok || !payload.ok) {
        if (payload.code === "OPERATOR_AUTH_REQUIRED") openOperatorAccess();
        throw new Error(payload.detail ?? payload.message ?? "The action could not be started.");
      }
      setNotice(payload.reused ? `Continuing ${payload.actionId}; no duplicate provider records were created.` : `${payload.actionId} started.`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "The action failed."); }
    finally { setWorking(false); }
  }

  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.id === status?.activeStage));
  const current = stages[activeIndex] ?? stages[0]!;
  const phase = phaseCopy[status?.phase ?? "not_started"] ?? { title: status?.phase?.replaceAll("_", " ") ?? "Loading", detail: status?.activeAction?.message ?? "Loading session state." };
  const busy = working || ["queued", "running"].includes(status?.activeAction?.status ?? "");
  const primary = status?.availableActions?.[0];
  const groupedProviders = useMemo(() => {
    const result = new Map<string, ProviderActivity[]>();
    for (const item of status?.providerActivity ?? []) {
      const key = `${item.stage ?? status?.activeStage ?? "problem_context"}:${item.featureId ?? "workflow"}`;
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return [...result.entries()];
  }, [status?.activeStage, status?.providerActivity]);

  if (loading) return <div className="demo-cockpit loading"><Loader2 className="spin" /><p>Loading the signed demo session…</p></div>;

  return <div className="demo-cockpit">
    <header className="cockpit-hero">
      <div>
        <p className="eyebrow">Live delivery cockpit</p>
        <h1>Turn a customer problem into a measured release</h1>
        <p>DailyCart demonstrates an AI-assisted product-delivery loop: agents cite synthetic company evidence, humans approve consequential decisions, and live providers produce inspectable engineering artifacts.</p>
      </div>
      <button className="button secondary" onClick={() => void startNewSession()} disabled={working}><Plus size={15} /> {status?.operator?.required && !status.operator.authorized ? "Unlock to start" : "Start new demo"}</button>
    </header>

    <section className="cockpit-boundary" aria-label="Demo boundary">
      <div><span className="live-dot" /><b>Synthetic company inputs</b><p>Privacy-safe interviews, support, analytics, strategy, and incidents.</p></div>
      <ArrowRight size={18} />
      <div><span className="live-dot" /><b>Executed delivery actions</b><p>Agents, approvals, provider writes, builds, browser evals, and release decisions.</p></div>
      <div className="session-chip"><small>Active session</small><b>{status?.session?.sessionId ?? "No session"}</b></div>
    </section>

    {!status?.session ? <section className="cockpit-empty panel">
      <FileSearch size={28} /><h2>Start a clean, isolated demonstration</h2><p>This creates one signed session shared by refreshes and tabs. Previous sessions remain archived and cannot leak into this run.</p>
      <button className="button primary" onClick={() => void startNewSession()} disabled={working}>{working ? <Loader2 className="spin" size={15} /> : status?.operator?.required && !status.operator.authorized ? <ShieldCheck size={15} /> : <Play size={15} />} {status?.operator?.required && !status.operator.authorized ? "Unlock operator access" : "Start guided demo"}</button>
      {notice && <p role="status">{notice}</p>}
    </section> : <>
      {confirmNewSession && <section className="new-session-confirm panel" role="dialog" aria-modal="false" aria-labelledby="new-session-title">
        <div><h2 id="new-session-title">Start a clean demo?</h2><p>The current session will be archived. Live provider records remain available as audit evidence.</p></div>
        <div><button className="button secondary" onClick={() => { setConfirmNewSession(false); setNotice(""); }}>Keep current session</button><button className="button primary" onClick={() => void startNewSession()} disabled={working}>{working ? <Loader2 className="spin" size={15} /> : <Plus size={15} />} Archive and start</button></div>
      </section>}
      <nav className="stage-rail" aria-label="Delivery stages">
        {stages.map((stage, index) => <Link key={stage.id} href={stage.href} className={index === activeIndex ? "active" : index < activeIndex ? "complete" : "upcoming"}>
          <span>{index < activeIndex ? <Check size={13} /> : stage.short}</span><div><b>{stage.title}</b><small>{index === activeIndex ? "Live now" : index < activeIndex ? "Completed" : "Upcoming"}</small></div>
        </Link>)}
      </nav>

      <section className={`live-stage panel ${status?.activeAction?.status ?? "idle"}`}>
        <div className="live-stage-head">
          <div><span className="stage-number">Stage {activeIndex + 1} of {stages.length}</span><h2>{phase.title}</h2><p>{status?.activeAction?.message ?? phase.detail}</p></div>
          {primary ? <button className="button primary" onClick={() => void execute(primary.command)} disabled={busy || !primary.enabled}>{busy ? <Loader2 size={15} className="spin" /> : primary.command === "retry" ? <RotateCcw size={15} /> : <Play size={15} />}{busy ? "Working…" : primary.label}</button> : status?.phase === "released" ? <span className="released-badge"><CheckCircle2 size={15} /> Released</span> : null}
        </div>
        <div className="cockpit-progress"><i style={{ width: `${status?.progress ?? 0}%` }} /></div>
        <div className="stage-telemetry"><span>{status?.progress ?? 0}% complete</span><span>Elapsed {displayDuration(status?.activeAction?.createdAt)}</span><span>Phase: {status?.phase?.replaceAll("_", " ")}</span>{status?.activeAction && <details className="technical-details"><summary>Technical details</summary><a href={`/api/workflow/actions/${status.activeAction.actionId}`} target="_blank" rel="noreferrer">View raw action record <ExternalLink size={10} /></a></details>}</div>
        {notice && <p className="cockpit-notice" role="status">{notice}</p>}
        {status?.activeAction?.error && <div className="cockpit-error"><AlertTriangle size={17} /><div><b>{status.activeAction.error.code}</b><p>{status.activeAction.error.detail}</p></div></div>}
        <div className="now-grid">
          <div><small>Completed</small><b>{status?.phaseSummary?.completed?.at(-1) ?? (activeIndex ? stages[activeIndex - 1]?.title : "Session created")}</b></div>
          <div><small>Running now</small><b>{status?.phaseSummary?.running ?? (busy ? phase.title : "Waiting for operator")}</b></div>
          <div><small>Next</small><b>{status?.phaseSummary?.next ?? current.description}</b></div>
        </div>
      </section>

      <div className="cockpit-main-grid">
        <section className="cockpit-column">
          <article className="active-agent panel">
            <header><div><p className="eyebrow">AI work</p><h2>{status?.activeAgent ? "Active agent" : "Agent provenance"}</h2></div>{status?.activeAgent?.status === "running" ? <Loader2 className="spin" size={18} /> : <Bot size={19} />}</header>
            {status?.activeAgent ? <>
              <div className="agent-identity"><span>{status.activeAgent.role.slice(0, 2).toUpperCase()}</span><div><b>{status.activeAgent.role}</b><small>{status.activeAgent.skillId} · v{status.activeAgent.skillVersion ?? "unversioned"}</small></div></div>
              <p className="agent-task">{status.activeAgent.task}</p>
              {status.activeAgent.reasoningSummary && <blockquote>{status.activeAgent.reasoningSummary}</blockquote>}
              <dl className="agent-facts"><div><dt>Context pack</dt><dd>{status.activeAgent.contextPackId ?? "Integrity check pending"}</dd></div><div><dt>Evidence</dt><dd>{status.activeAgent.evidenceIds?.join(", ") || "Integrity check pending"}</dd></div><div><dt>Model</dt><dd>{status.activeAgent.model ?? status.activeAgent.sourceMode ?? "Pending"}</dd></div><div><dt>Telemetry</dt><dd>{(status.activeAgent.latencyMs / 1000).toFixed(1)}s · ${status.activeAgent.costUsd.toFixed(3)}</dd></div></dl>
              <Link className="text-link" href={status.activeAgent.runId ? `/runs#run-${status.activeAgent.runId}` : "/runs"}>Inspect this agent run <ArrowRight size={13} /></Link>
            </> : <p className="empty-copy">No agent is active at this gate. Completed runs remain available with skill, evidence, tool, and evaluation provenance.</p>}
          </article>

          <section className="stage-evidence panel">
            <header><div><p className="eyebrow">Stage evidence</p><h2>{current.title}</h2></div><Link href={current.href}>Open drill-down <ExternalLink size={12} /></Link></header>
            {status?.recommendations?.length ? <div className="recommendation-list">{status.recommendations.map((item, index) => <article key={item.id}><span>{index + 1}</span><div><b>{item.title}</b><small>{item.id} · {item.score}/100 · {Math.round(item.confidence * 100)}% confidence</small><p>{item.problem}</p></div></article>)}</div> : <p className="empty-copy">Recommendations appear here after the PM agent completes evidence-grounded ranking.</p>}
            {status?.previewEvals?.length ? <div className="cockpit-evals">{status.previewEvals.map((item) => <article key={`${item.featureId}-${item.targetUrl}`} className={item.passed ? "passed" : "failed"}><header><b>{item.featureId}</b><span>{item.score}/100 · {item.passed ? "Passed" : "Blocked"}</span></header>{item.checks.map((check) => <p key={check.name}>{check.passed ? <Check size={12} /> : <AlertTriangle size={12} />} {check.name}: {check.detail}</p>)}{item.githubRunUrl && <a href={item.githubRunUrl} target="_blank" rel="noreferrer">Open exact GitHub Actions run <ExternalLink size={10} /></a>}</article>)}</div> : null}
          </section>
        </section>

        <aside className="cockpit-column">
          <section className="event-stream panel">
            <header><div><p className="eyebrow">Chronological execution</p><h2>What happened</h2></div><Clock3 size={18} /></header>
            <div>{(status?.timeline ?? []).slice(-12).reverse().map((event) => <article key={event.id}><span className={event.status === "running" ? "pulse" : ""}>{event.status === "running" ? <Loader2 className="spin" size={11} /> : <CircleDot size={11} />}</span><div><b>{event.title}</b><p>{event.detail}</p><small>{event.actor ?? event.provider ?? event.kind} · {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small>{event.links?.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={9} /></a>)}</div></article>)}</div>
            {!status?.timeline?.length && <p className="empty-copy">The event stream starts when you analyze the company evidence.</p>}
          </section>
        </aside>
      </div>

      <section className="provider-story panel">
        <header><div><p className="eyebrow">External proof</p><h2>Provider actions, grouped by cause</h2><p>These are exact provider artifacts for this signed session. Raw JSON is secondary technical evidence.</p></div><ShieldCheck size={20} /></header>
        {groupedProviders.map(([key, items]) => <div className="provider-stage-group" key={key}><h3>{key.split(":")[0].replaceAll("_", " ")} · {key.split(":")[1]}</h3><div>{items.map((item) => { const url = item.artifactUrl ?? item.dashboardUrl; return <article key={`${item.provider}-${item.kind}-${item.externalId ?? item.label}`} className={item.status}><span>{item.provider.slice(0, 2).toUpperCase()}</span><div><small>{item.provider} · {item.kind}</small><b>{item.label}</b><p>{item.status === "pending" ? "In progress—this link will appear when the provider returns an external record." : item.error ?? `${item.status} ${item.completedAt ? `· ${new Date(item.completedAt).toLocaleTimeString()}` : ""}`}</p>{url ? <a href={url} target="_blank" rel="noreferrer">Open exact record <ExternalLink size={10} /></a> : <em>{item.status === "unavailable" ? "Dashboard not configured" : "Waiting for provider…"}</em>}</div></article>; })}</div></div>)}
      </section>

      {status?.completionSummary && <section className="completion-report panel">
        <header><div><p className="eyebrow">Delivery report</p><h2>What this session delivered</h2><p>The complete release story remains linked to the session after refresh.</p></div><CheckCircle2 size={24} /></header>
        <div className="completion-metrics"><div><small>Agents</small><b>{status.completionSummary.agents.length}</b></div><div><small>Human decisions</small><b>{status.completionSummary.decisions.length}</b></div><div><small>Builds</small><b>{status.completionSummary.builds.length}</b></div><div><small>Measured cost</small><b>${status.completionSummary.telemetry.totalCostUsd.toFixed(3)}</b></div></div>
        <div className="completion-actions"><Link className="button primary" href="/runs/summary">Open full delivery report <ArrowRight size={14} /></Link><Link className="button secondary" href="/analytics">Measure product outcomes</Link><Link className="button secondary" href="/lineage">Trace end to end</Link></div>
      </section>}
    </>}
  </div>;
}
