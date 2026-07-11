import { CheckCircle2, ExternalLink, GitCommit, LockKeyhole, Rocket, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";

export default async function ReleasesPage() {
  const data = await loadDemoState();
  const deployment = data.deployments[0];
  return (
    <div className="page-container">
      <PageHeading eyebrow="Release operations" title="Deployments & releases" description="Commit-aware previews and production releases protected by eval and human approval gates." actions={<button className="button primary"><Rocket size={15} /> Prepare release</button>} />
      <section className="release-hero panel"><div className="release-icon"><Rocket size={24} /></div><div><div className="release-title"><span className="mono-id">REL-0001</span><StatusPill status={deployment?.status ?? "ready"} /></div><h2>Checkout recovery guidance · V1</h2><p>Production deployment recorded after corrected eval campaign and release-manager approval.</p><div className="release-links"><span><GitCommit size={14} /> {deployment?.commitSha}</span><Link href="/lineage">FEAT-0001 <ExternalLink size={12} /></Link><Link href="/evals">EVAL-0002 <ExternalLink size={12} /></Link></div></div><div className="release-score"><span>Gate score</span><strong>94</strong><small>Threshold 85</small></div></section>
      <div className="release-layout">
        <section className="panel release-checks"><div className="section-title"><div><p className="eyebrow">Immutable decision evidence</p><h2>Release gate checklist</h2></div><StatusPill status="passed" /></div>{[
          ["Build and unit checks", "CI run #1042"], ["Deterministic evals", "31 / 31 passed"], ["Semantic quality", "92 / 100"], ["Critical regression", "Focus case passed"], ["Human release approval", "APR-0002"], ["Lineage completeness", "100%"]
        ].map(([name, evidence]) => <div className="release-check-row" key={name}><CheckCircle2 size={17} /><div><b>{name}</b><span>{evidence}</span></div><StatusPill status="passed" /></div>)}</section>
        <aside className="release-side">
          <section className="panel deploy-record"><div className="section-title"><div><p className="eyebrow">Deployment record</p><h2>{deployment?.id}</h2></div><StatusPill status={deployment?.status ?? "ready"} /></div><dl><div><dt>Environment</dt><dd>{deployment?.environment}</dd></div><div><dt>Provider</dt><dd>Mock deployment adapter</dd></div><div><dt>Commit</dt><dd>{deployment?.commitSha}</dd></div><div><dt>Deployed</dt><dd>{deployment && new Date(deployment.deployedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</dd></div></dl><a href={deployment?.url} className="button secondary">Open provider record <ExternalLink size={13} /></a></section>
          <section className="panel protected-action"><LockKeyhole size={21} /><div><h3>Production writes protected</h3><p>Live deploys require a passing gate plus a separate authorized human approval.</p></div></section>
        </aside>
      </div>
      <section className="panel release-timeline"><div className="section-title"><div><p className="eyebrow">Release history</p><h2>Failure and recovery</h2></div></div><div className="horizontal-timeline"><div><ShieldCheck size={17} /><b>Preview built</b><small>17:27 UTC</small></div><div className="timeline-fail"><span>!</span><b>Gate blocked</b><small>17:31 UTC</small></div><div><GitCommit size={17} /><b>Correction</b><small>17:47 UTC</small></div><div><CheckCircle2 size={17} /><b>Rerun passed</b><small>17:56 UTC</small></div><div><Rocket size={17} /><b>Released</b><small>18:18 UTC</small></div></div></section>
    </div>
  );
}
