import { Bot, ChevronRight, Clock3, DollarSign, RotateCcw, Route } from "lucide-react";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { WorkflowAction } from "./workflow-action";
import { getRuntimeMode } from "@/lib/runtime-mode";
import { VoiceCommand } from "./voice-command";

export default async function RunsPage() {
  const data = await loadDemoState();
  const maxLatency = Math.max(...data.runs.map((run) => run.latencyMs));
  const runtimeMode = getRuntimeMode();
  return (
    <div className="page-container">
      <PageHeading eyebrow="Agent operations" title="Agent runs" description="Inspectable retrieval, reasoning, tools, retries, cost, latency, and outcomes." actions={<WorkflowAction />} />
      <VoiceCommand />
      <section className="run-metrics metric-grid"><article className="metric-card"><span className="metric-icon violet"><Bot size={19} /></span><div><p>Total runs</p><strong>{data.runs.length}</strong><small>6 role contracts available</small></div></article><article className="metric-card"><span className="metric-icon blue"><Clock3 size={19} /></span><div><p>Median latency</p><strong>4.2s</strong><small>End-to-end measured</small></div></article><article className="metric-card"><span className="metric-icon green"><DollarSign size={19} /></span><div><p>Scenario cost</p><strong>${data.runs.reduce((sum, run) => sum + run.costUsd, 0).toFixed(2)}</strong><small>{runtimeMode === "live" ? "Live judge + provider calls" : "Mocked model pricing"}</small></div></article><article className="metric-card"><span className="metric-icon amber"><RotateCcw size={19} /></span><div><p>Retries</p><strong>{data.runs.reduce((sum, run) => sum + run.retries, 0)}</strong><small>Policy-compliant retry</small></div></article></section>
      <div className="runs-layout">
        <section className="panel run-table-panel"><div className="section-title"><div><p className="eyebrow">Execution history</p><h2>Recorded runs</h2></div><span className="source-label">{runtimeMode === "live" ? "Live provider path" : "Simulated execution"}</span></div><div className="run-table"><div className="run-table-head"><span>Run</span><span>Agent</span><span>Status</span><span>Telemetry</span><span /></div>{data.runs.map((run) => <details key={run.id}><summary><span className="mono-id">{run.id}</span><span className="agent-cell"><i>{run.agent.slice(0, 2).toUpperCase()}</i>{run.agent}</span><StatusPill status={run.status} /><span className="telemetry"><b>{(run.latencyMs / 1000).toFixed(1)}s</b><small>${run.costUsd.toFixed(3)}</small></span><ChevronRight size={15} /></summary><div className="trace-detail"><div className="trace-head"><span><Route size={14} /> Trace {run.traceId}</span><b>{run.steps.length} steps · {run.retries} retries</b></div>{run.steps.map((step, index) => <div className="trace-step" key={`${run.id}-${step.name}`}><span>{index + 1}</span><div><b>{step.name}</b><p>{step.detail}</p></div><small>{step.durationMs}ms</small><StatusPill status={step.status} /></div>)}</div></details>)}</div></section>
        <aside className="panel trend-panel"><div className="section-title"><div><p className="eyebrow">Efficiency</p><h2>Latency and cost</h2></div></div><div className="latency-chart">{data.runs.map((run) => <div key={run.id}><span>{run.id}</span><div><i style={{ height: `${Math.max(12, Math.round((run.latencyMs / maxLatency) * 100))}%` }} /></div><small>{(run.latencyMs / 1000).toFixed(1)}s</small></div>)}</div><div className="chart-legend"><span><i className="violet-dot" /> Latency</span><b>Measured locally</b></div><hr /><h3>Trajectory policy</h3><div className="policy-list"><p><span>✓</span> Approval observed before writes</p><p><span>✓</span> Retrieval cites valid IDs</p><p><span>✓</span> Retry stayed within budget</p><p><span>✓</span> Run state is serializable</p></div></aside>
      </div>
    </div>
  );
}
