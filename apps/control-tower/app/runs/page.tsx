import { Bot, ChevronRight, Clock3, DollarSign, RotateCcw, Route } from "lucide-react";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { WorkflowAction } from "./workflow-action";
import { getRuntimeMode } from "@/lib/runtime-mode";
import { VoiceCommand } from "./voice-command";
import { readArtifact } from "@/lib/durable-artifacts";
import { serverSessionId } from "@/lib/demo-session";
import { SessionStageBanner } from "@/app/ui/session-stage-banner";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const sessionId = await serverSessionId();
  const data = await loadDemoState(sessionId);
  const maxLatency = Math.max(1, ...data.runs.map((run) => run.latencyMs));
  const runtimeMode = getRuntimeMode();
  const reviewArtifact = sessionId ? await readArtifact<{ agentEvals?: Array<{ id: string; runId: string; criterion: string; grader: string; score: number; passed: boolean; rationale: string; mode: string }> }>("workflowReviews", sessionId) : undefined;
  const agentEvals = reviewArtifact?.agentEvals ?? [];
  return (
    <div className="page-container">
      <PageHeading eyebrow="Agent operations" title="Agent runs" description="Inspectable retrieval, reasoning, tools, retries, cost, latency, and outcomes." />
      <SessionStageBanner stage="agent_analysis" />
      <WorkflowAction />
      <VoiceCommand />
      <section className="run-metrics metric-grid"><article className="metric-card"><span className="metric-icon violet"><Bot size={19} /></span><div><p>Total runs</p><strong>{data.runs.length}</strong><small>6 role contracts available</small></div></article><article className="metric-card"><span className="metric-icon blue"><Clock3 size={19} /></span><div><p>Median latency</p><strong>4.2s</strong><small>End-to-end measured</small></div></article><article className="metric-card"><span className="metric-icon green"><DollarSign size={19} /></span><div><p>Scenario cost</p><strong>${data.runs.reduce((sum, run) => sum + run.costUsd, 0).toFixed(2)}</strong><small>{runtimeMode === "live" ? "Live judge + provider calls" : "Mocked model pricing"}</small></div></article><article className="metric-card"><span className="metric-icon amber"><RotateCcw size={19} /></span><div><p>Retries</p><strong>{data.runs.reduce((sum, run) => sum + run.retries, 0)}</strong><small>Policy-compliant retry</small></div></article></section>
      <div className="runs-layout">
        <section className="panel run-table-panel" id="agent-activity"><div className="section-title"><div><p className="eyebrow">Execution history</p><h2>Current-session runs</h2></div><span className="source-label">{runtimeMode === "live" ? "Live provider path" : "Deterministic fallback"}</span></div>{!sessionId || data.runs.length === 0 ? <div className="integrity-empty"><h3>No agent runs in this session yet</h3><p>Start analysis from the demo cockpit. Sample runs are intentionally excluded from live sessions.</p></div> : <div className="run-table"><div className="run-table-head"><span>Run</span><span>Agent</span><span>Status</span><span>Telemetry</span><span /></div>{data.runs.map((run) => { const agentLabel = run.agent === "engineering_feasibility" ? "engineering feasibility" : run.agent; const evaluations = agentEvals.filter((evaluation) => evaluation.runId === run.id); const missing = !run.skillId || !run.skillVersion || !run.contextPackId || !run.citedEvidenceIds?.length; return <details key={run.id} id={`run-${run.id}`} open={missing}><summary><span className="mono-id">{run.id}</span><span className="agent-cell"><i>{agentLabel.slice(0, 2).toUpperCase()}</i>{agentLabel}</span><StatusPill status={missing ? "failed" : run.status} /><span className="telemetry"><b>{(run.latencyMs / 1000).toFixed(1)}s</b><small>${run.costUsd.toFixed(3)}</small></span><ChevronRight size={15} /></summary><div className="trace-detail"><div className="trace-head"><span><Route size={14} /> Trace {run.traceId}</span><b>{run.steps.length} steps · {run.retries} retries</b></div>{missing ? <div className="data-integrity-error"><b>Data-integrity failure</b><p>This live run is missing required skill, context-pack, or evidence provenance. Workflow progression is blocked.</p></div> : <div className="run-provenance"><span><b>Skill</b>{run.skillId} · v{run.skillVersion}</span><span><b>Context</b>{run.contextPackId}</span><span><b>Evidence</b>{run.citedEvidenceIds?.join(", ")}</span><span><b>Tools</b>{run.toolCalls?.map((tool) => `${tool.provider}:${tool.name}`).join(", ") || "No external tool call"}</span></div>}{run.reasoningSummary && <p className="trace-reasoning"><b>Reasoning summary</b> {run.reasoningSummary}</p>}{evaluations.length > 0 && <section className="agent-eval-list" aria-label={`Evaluations for ${run.id}`}><b>Agent-output evaluations</b>{evaluations.map((evaluation) => <article key={evaluation.id}><StatusPill status={evaluation.passed ? "passed" : "failed"} /><div><strong>{evaluation.criterion}</strong><p>{evaluation.rationale}</p><small>{evaluation.grader} · {evaluation.mode} · {evaluation.score}/100</small></div></article>)}</section>}{run.steps.map((step, index) => <div className="trace-step" key={`${run.id}-${step.name}`}><span>{index + 1}</span><div><b>{step.name}</b><p>{step.detail}</p></div><small>{step.durationMs}ms</small><StatusPill status={step.status} /></div>)}</div></details>; })}</div>}</section>
        <aside className="panel trend-panel"><div className="section-title"><div><p className="eyebrow">Efficiency</p><h2>Latency and cost</h2></div></div><div className="latency-chart">{data.runs.map((run) => <div key={run.id}><span>{run.id}</span><div><i style={{ height: `${Math.max(12, Math.round((run.latencyMs / maxLatency) * 100))}%` }} /></div><small>{(run.latencyMs / 1000).toFixed(1)}s</small></div>)}</div><div className="chart-legend"><span><i className="violet-dot" /> Latency</span><b>Measured locally</b></div><hr /><h3>Trajectory policy</h3><div className="policy-list"><p><span>✓</span> Approval observed before writes</p><p><span>✓</span> Retrieval cites valid IDs</p><p><span>✓</span> Retry stayed within budget</p><p><span>✓</span> Run state is serializable</p></div></aside>
      </div>
    </div>
  );
}
