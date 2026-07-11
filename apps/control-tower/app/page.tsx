import { ArrowRight, CheckCircle2, Clock3, ShieldAlert, TrendingUp } from "lucide-react";
import Link from "next/link";
import { loadDemoState } from "@/lib/load-demo-state";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { DemoControls } from "@/app/ui/demo-controls";

export default async function OverviewPage() {
  const data = await loadDemoState();
  const primary = data.features[0];
  const latestCampaign = data.campaigns.at(-1);
  const healthy = data.integrations.filter((item) => item.status === "healthy").length;
  const maxFunnel = data.funnel[0]?.count ?? 1;

  return (
    <div className="page-container">
      <PageHeading eyebrow="Command center" title="Good afternoon, operator" description="One evidence-linked view from customer signal to production outcome." actions={<DemoControls />} />
      <section className="notice-bar"><span className="notice-icon"><ShieldAlert size={18} /></span><div><b>Release gate recovery demonstrated</b><p>EVAL-0001 blocked a critical accessibility regression. The corrected EVAL-0002 passed at 94.</p></div><Link href="/evals">Inspect evidence <ArrowRight size={15} /></Link></section>
      <section className="metric-grid">
        <article className="metric-card"><span className="metric-icon violet"><LayersIcon /></span><div><p>Active features</p><strong>{data.features.length}</strong><small><TrendingUp size={13} /> 1 released this cycle</small></div></article>
        <article className="metric-card"><span className="metric-icon blue"><Clock3 size={19} /></span><div><p>Agent runs</p><strong>{data.runs.length}</strong><small>{data.runs.filter((run) => run.status === "succeeded").length} completed · {data.runs.reduce((sum, run) => sum + run.retries, 0)} retry</small></div></article>
        <article className="metric-card"><span className="metric-icon green"><CheckCircle2 size={19} /></span><div><p>Latest eval score</p><strong>{latestCampaign?.weightedScore ?? 0}</strong><small>Threshold {latestCampaign?.threshold ?? 85} · release allowed</small></div></article>
        <article className="metric-card"><span className="metric-icon amber"><NetworkIcon /></span><div><p>Integration health</p><strong>{healthy}/{data.integrations.length}</strong><small>Mock providers · credential-free</small></div></article>
      </section>
      <div className="overview-grid">
        <section className="panel span-8">
          <div className="panel-heading"><div><p className="eyebrow">Priority feature</p><h2>{primary?.title}</h2></div><StatusPill status={primary?.status ?? "candidate"} /></div>
          <p className="muted-copy">{primary?.problem}</p>
          <div className="score-row"><div><span>Opportunity score</span><b>{primary?.score}/100</b><div className="progress"><i style={{ width: `${primary?.score}%` }} /></div></div><div><span>Evidence confidence</span><b>{Math.round((primary?.confidence ?? 0) * 100)}%</b><div className="progress teal"><i style={{ width: `${(primary?.confidence ?? 0) * 100}%` }} /></div></div></div>
          <div className="evidence-chips">{primary?.evidenceIds.map((id) => <Link href={`/lineage?focus=${id}`} key={id}>{id}</Link>)}</div>
          <div className="lifecycle-mini">
            {["Evidence", "Approved", "Two workstreams", "Blocked", "Corrected", "Released"].map((item, index) => <div key={item} className={index === 3 ? "failed-node" : "done-node"}><span>{index === 3 ? "!" : "✓"}</span><small>{item}</small></div>)}
          </div>
          <Link href="/lineage" className="text-link">Open complete feature lineage <ArrowRight size={15} /></Link>
        </section>
        <section className="panel span-4 activity-panel">
          <div className="panel-heading"><div><p className="eyebrow">Live history</p><h2>Activity stream</h2></div><Link href="/runs">View all</Link></div>
          <div className="activity-list">{data.activity.map((item) => <article key={`${item.at}-${item.entityId}`}><span className={`activity-dot ${item.type}`} /><div><b>{item.title}</b><p>{item.detail}</p><small>{new Date(item.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC · <Link href="/lineage">{item.entityId}</Link></small></div></article>)}</div>
        </section>
        <section className="panel span-7">
          <div className="panel-heading"><div><p className="eyebrow">Product outcome</p><h2>Checkout funnel</h2></div><span className="source-label">Simulated · seed {data.seed}</span></div>
          <div className="funnel-bars">{data.funnel.map((stage, index) => <div key={stage.stage}><span>{stage.stage}</span><div><i style={{ width: `${Math.round((stage.count / maxFunnel) * 100)}%` }} /></div><b>{stage.count.toLocaleString()}</b>{index > 0 && <small>{Math.round((stage.count / data.funnel[index - 1].count) * 100)}%</small>}</div>)}</div>
          <Link href="/analytics" className="text-link">Explore product analytics <ArrowRight size={15} /></Link>
        </section>
        <section className="panel span-5">
          <div className="panel-heading"><div><p className="eyebrow">Release readiness</p><h2>Gate checklist</h2></div><StatusPill status="passed" /></div>
          <div className="checklist">{["Build, lint, and type checks", "Deterministic evals", "Critical regression suite", "Human release approval", "Lineage coverage"].map((item) => <div key={item}><CheckCircle2 size={17} /><span>{item}</span><b>Passed</b></div>)}</div>
          <Link href="/releases" className="text-link">View deployment record <ArrowRight size={15} /></Link>
        </section>
      </div>
    </div>
  );
}

function LayersIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>; }
function NetworkIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/><path d="M10 7h4a3 3 0 0 1 3 3v4"/></svg>; }
