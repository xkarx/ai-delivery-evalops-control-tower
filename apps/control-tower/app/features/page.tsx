import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { TicketAction } from "./ticket-action";
import { AnalyzeAction } from "./analyze-action";
import { serverSessionId } from "@/lib/demo-session";
import { SessionStageBanner } from "@/app/ui/session-stage-banner";

const columns = [
  { key: "candidate", title: "Discovery", hint: "Evidence being synthesized" },
  { key: "in_delivery", title: "In delivery", hint: "Approved and executing" },
  { key: "released", title: "Released", hint: "Measuring outcomes" }
] as const;

export default async function FeaturesPage() {
  const sessionId = await serverSessionId();
  const data = await loadDemoState(sessionId);
  return (
    <div className="page-container">
      <PageHeading eyebrow="Portfolio" title="Feature portfolio" description="Evidence-weighted opportunities moving through approval, delivery, evaluation, and outcomes." actions={<AnalyzeAction />} />
      <SessionStageBanner stage="ranked_opportunities" />
      <div className="portfolio-source"><span className="source-label">Synthetic company inputs · executed workflow records</span></div>
      <section className="portfolio-summary">
        <div><span>Portfolio confidence</span><b>81%</b><div className="progress"><i style={{ width: "81%" }} /></div></div>
        <div><span>Evidence records linked</span><b>{new Set(data.features.flatMap((feature) => feature.evidenceIds)).size}</b><small>Across 5 source kinds</small></div>
        <div><span>Decision cycle</span><b>22m</b><small>From analysis to approval</small></div>
      </section>
      <section className="kanban">
        {columns.map((column) => {
          const features = data.features.filter((feature) => feature.status === column.key);
          return <div className="kanban-column" key={column.key}>
            <header><div><h2>{column.title}</h2><p>{column.hint}</p></div><span>{features.length}</span></header>
            <div className="kanban-stack">{features.map((feature) => <article className="feature-card" key={feature.id}>
              <div className="card-meta"><span className="mono-id">{feature.id}</span><StatusPill status={feature.status} /></div>
              <h3>{feature.title}</h3><p>{feature.problem}</p>
              <div className="mini-score"><span>Priority</span><b>{feature.score}</b><div className="progress"><i style={{ width: `${feature.score}%` }} /></div></div>
              <dl><div><dt>Confidence</dt><dd>{Math.round(feature.confidence * 100)}%</dd></div><div><dt>Evidence</dt><dd>{feature.evidenceIds.length} linked</dd></div><div><dt>Stream</dt><dd>{feature.workstream}</dd></div></dl>
              <div className="evidence-chips compact">{feature.evidenceIds.slice(0, 3).map((id) => <Link href={`/lineage?focus=${id}`} key={id}>{id}</Link>)}</div>
              <div className="feature-actions"><Link className="card-link" href={`/lineage?feature=${feature.id}`}>Open lineage <ArrowUpRight size={14} /></Link><TicketAction featureId={feature.id} title={feature.title} description={feature.problem} /></div>
            </article>)}</div>
            {features.length === 0 && <div className="empty-column"><p>No features in this state</p></div>}
          </div>;
        })}
      </section>
      <section className="panel evidence-note"><div><b>Recommendation integrity</b><p>The PM ranker scores evidence clusters at runtime. Change the scenario manifest or seed and the ranked recommendation changes; feature IDs shown here are the recorded output of seed {data.seed}.</p></div><Link href="/company">Inspect source evidence <ArrowUpRight size={14} /></Link></section>
    </div>
  );
}
