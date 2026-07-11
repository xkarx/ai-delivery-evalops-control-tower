import { ArrowDown, Check, ExternalLink, GitCommitHorizontal, Link2, ShieldX } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { ActionFeedbackButton } from "@/app/ui/action-feedback";

const stages = [
  { id: "EVD-0003", type: "Evidence", title: "Checkout failures lack recovery guidance", detail: "Interview + support + analytics cluster", status: "passed" },
  { id: "FEAT-0001", type: "Recommendation", title: "Checkout recovery guidance", detail: "PM run RUN-0001 · score 91", status: "passed" },
  { id: "DEC-0001", type: "Human decision", title: "Approved for delivery", detail: "Product council · rationale recorded", status: "approved" },
  { id: "TKT-0001 · TKT-0002", type: "Parallel delivery", title: "API + checkout UI workstreams", detail: "RUN-0002 and RUN-0003", status: "succeeded" },
  { id: "EVAL-0001", type: "Release gate", title: "Critical regression blocked release", detail: "Keyboard focus escaped retry dialog", status: "blocked" },
  { id: "EVAL-0002", type: "Correction", title: "Regression corrected and rerun", detail: "94 / 100 · threshold 85", status: "passed" },
  { id: "DEP-0001", type: "Production", title: "Release recorded", detail: "Commit 7d91e2b · mocked deployment", status: "ready" },
  { id: "INC-0001 → EVALCASE-0031", type: "Feedback", title: "Production signal became regression", detail: "Duplicate mobile retry analytics", status: "passed" }
];

export default async function LineagePage() {
  const data = await loadDemoState();
  return (
    <div className="page-container">
      <PageHeading eyebrow="Audit trail" title="Feature lineage" description="Every claim, decision, run, gate, release, and outcome linked by stable identifiers." actions={<><ActionFeedbackButton><Link2 size={15} /> Copy lineage link</ActionFeedbackButton><ActionFeedbackButton className="button primary">Export evidence</ActionFeedbackButton></>} />
      <div className="lineage-header panel"><div><span className="mono-id">FEAT-0001</span><h2>Checkout recovery guidance</h2><p>Selected from three ranked opportunities using 47 evidence records.</p></div><div><StatusPill status="released" /><span className="source-label">Complete · 8 stages</span></div></div>
      <div className="lineage-layout">
        <section className="panel lineage-timeline">
          <div className="section-title"><div><p className="eyebrow">Lifecycle</p><h2>Evidence to outcome</h2></div><span>{data.lineage.length} stored edges</span></div>
          {stages.map((stage, index) => <article key={stage.id} className={stage.status === "blocked" ? "lineage-stage blocked-stage" : "lineage-stage"}>
            <div className="stage-marker">{stage.status === "blocked" ? <ShieldX size={16} /> : <Check size={15} />}</div>
            <div className="stage-content"><div className="stage-top"><span>{stage.type}</span><StatusPill status={stage.status} /></div><h3>{stage.title}</h3><p>{stage.detail}</p><div><span className="mono-id">{stage.id}</span><Link href="#edges">Open record <ExternalLink size={12} /></Link></div></div>
            {index < stages.length - 1 && <ArrowDown className="stage-arrow" size={14} />}
          </article>)}
        </section>
        <aside className="lineage-aside">
          <section className="panel graph-card"><div className="section-title"><div><p className="eyebrow">Dependency graph</p><h2>Delivery topology</h2></div></div><div className="dependency-graph"><div className="graph-node root"><span>FEAT</span><b>0001</b></div><div className="graph-branch"><i /><i /></div><div className="graph-children"><div className="graph-node"><span>TKT</span><b>0001</b><small>API</small></div><div className="graph-node"><span>TKT</span><b>0002</b><small>UI</small></div></div><div className="graph-join" /><div className="graph-node eval"><span>EVAL</span><b>0002</b><small>gate</small></div></div></section>
          <section className="panel edge-card" id="edges"><div className="section-title"><div><p className="eyebrow">Stored relationships</p><h2>Lineage edges</h2></div></div>{data.lineage.map((edge) => <div className="edge-row" key={edge.id}><GitCommitHorizontal size={14} /><div><b>{edge.sourceId}</b><span>{edge.relationship.replaceAll("_", " ")}</span><b>{edge.targetId}</b></div></div>)}</section>
          <section className="panel completeness-card"><span>Lineage completeness</span><strong>100%</strong><div className="progress teal"><i style={{ width: "100%" }} /></div><p>All required lifecycle entity types have at least one inbound or outbound edge.</p></section>
        </aside>
      </div>
    </div>
  );
}
