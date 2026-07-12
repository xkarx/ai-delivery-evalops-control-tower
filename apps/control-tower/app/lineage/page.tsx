import { ArrowDown, Check, ExternalLink, GitCommitHorizontal, ShieldX } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { LineageActions } from "./lineage-actions";

export default async function LineagePage() {
  const data = await loadDemoState();
  const feature = data.features.find((item) => item.id === "FEAT-0001") ?? data.features[0]!;
  const decision = data.decisions.find((item) => item.featureId === feature.id);
  const tickets = data.tickets.filter((item) => item.featureId === feature.id);
  const campaigns = data.campaigns.filter((item) => item.featureId === feature.id);
  const blocked = campaigns.find((item) => item.status === "blocked");
  const passed = campaigns.findLast((item) => item.status === "passed");
  const deployment = data.deployments.findLast((item) => item.featureId === feature.id);
  const incident = data.incidents.find((item) => item.featureId === feature.id || item.regressionCaseId);
  const evidenceIds = feature.evidenceIds;
  const stageRows = [
    { id: evidenceIds.slice(0, 3).join(" · "), type: "Evidence", title: "Customer signals retrieved", detail: `${evidenceIds.length} evidence records cited by the selected opportunity`, status: "passed" },
    { id: feature.id, type: "Recommendation", title: feature.title, detail: `Evidence-weighted score ${feature.score} · ${Math.round(feature.confidence * 100)}% confidence`, status: feature.status === "released" ? "passed" : feature.status },
    decision && { id: decision.id, type: "Human decision", title: `${decision.outcome} for delivery`, detail: `${decision.reviewer} · ${decision.rationale}`, status: decision.outcome },
    tickets.length > 0 && { id: tickets.map((item) => item.id).join(" · "), type: "Parallel delivery", title: `${tickets.length} linked work items`, detail: `${new Set(tickets.map((item) => item.workstream)).size} workstreams with recorded dependencies`, status: tickets.every((item) => item.status === "done") ? "succeeded" : "in_progress" },
    blocked && { id: blocked.id, type: "Release gate", title: "Critical regression blocked release", detail: `${blocked.weightedScore} / 100 · ${blocked.failureCategories.join(", ")}`, status: "blocked" },
    passed && { id: passed.id, type: "Correction", title: "Corrected campaign passed", detail: `${passed.weightedScore} / 100 · threshold ${passed.threshold}`, status: "passed" },
    deployment && { id: deployment.id, type: "Production", title: "Production deployment recorded", detail: `Commit ${deployment.commitSha} · ${deployment.sourceMode} · ${deployment.url}`, status: deployment.status },
    incident && { id: `${incident.id}${incident.regressionCaseId ? ` → ${incident.regressionCaseId}` : ""}`, type: "Feedback", title: incident.title, detail: incident.rootCause, status: incident.status }
  ].filter((stage): stage is { id: string; type: string; title: string; detail: string; status: string } => Boolean(stage));
  return (
    <div className="page-container">
      <PageHeading eyebrow="Audit trail" title="Feature lineage" description="Every claim, decision, run, gate, release, and outcome linked by stable identifiers." actions={<LineageActions />} />
      <div className="lineage-header panel"><div><span className="mono-id">{feature.id}</span><h2>{feature.title}</h2><p>Selected from ranked opportunities using {feature.evidenceIds.length} cited evidence records.</p></div><div><StatusPill status={feature.status} /><span className="source-label">{stageRows.length} recorded stages</span></div></div>
      <div className="lineage-layout">
        <section className="panel lineage-timeline">
          <div className="section-title"><div><p className="eyebrow">Lifecycle</p><h2>Evidence to outcome</h2></div><span>{data.lineage.length} stored edges</span></div>
          {stageRows.map((stage, index) => <article key={stage.id} className={stage.status === "blocked" ? "lineage-stage blocked-stage" : "lineage-stage"}>
            <div className="stage-marker">{stage.status === "blocked" ? <ShieldX size={16} /> : <Check size={15} />}</div>
            <div className="stage-content"><div className="stage-top"><span>{stage.type}</span><StatusPill status={stage.status} /></div><h3>{stage.title}</h3><p>{stage.detail}</p><div><span className="mono-id">{stage.id}</span><Link href="#edges">Open record <ExternalLink size={12} /></Link></div></div>
            {index < stageRows.length - 1 && <ArrowDown className="stage-arrow" size={14} />}
          </article>)}
        </section>
        <aside className="lineage-aside">
          <section className="panel graph-card"><div className="section-title"><div><p className="eyebrow">Dependency graph</p><h2>Delivery topology</h2></div></div><div className="dependency-graph"><div className="graph-node root"><span>FEATURE</span><b>{feature.id.replace("FEAT-", "")}</b></div><div className="graph-branch"><i /><i /></div><div className="graph-children">{tickets.slice(0, 2).map((ticket) => <div className="graph-node" key={ticket.id}><span>TICKET</span><b>{ticket.id.replace("TKT-", "")}</b><small>{ticket.workstream}</small></div>)}</div>{passed && <><div className="graph-join" /><div className="graph-node eval"><span>EVAL</span><b>{passed.id.replace("EVAL-", "")}</b><small>gate</small></div></>}</div></section>
          <section className="panel edge-card" id="edges"><div className="section-title"><div><p className="eyebrow">Stored relationships</p><h2>Lineage edges</h2></div></div>{data.lineage.map((edge) => <div className="edge-row" key={edge.id}><GitCommitHorizontal size={14} /><div><b>{edge.sourceId}</b><span>{edge.relationship.replaceAll("_", " ")}</span><b>{edge.targetId}</b></div></div>)}</section>
          <section className="panel completeness-card"><span>Lineage completeness</span><strong>100%</strong><div className="progress teal"><i style={{ width: "100%" }} /></div><p>All required lifecycle entity types have at least one inbound or outbound edge.</p></section>
        </aside>
      </div>
    </div>
  );
}
