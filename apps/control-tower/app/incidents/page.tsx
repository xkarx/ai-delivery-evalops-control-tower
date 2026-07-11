import { ArrowRight, CheckCircle2, Clock3, FlaskConical, HeartPulse, Link2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";

export default async function IncidentsPage() {
  const data = await loadDemoState();
  const incident = data.incidents[0];
  return (
    <div className="page-container">
      <PageHeading eyebrow="Production feedback" title="Incidents" description="Operational failures become durable evidence, follow-up work, and regression protection." actions={<button className="button primary"><TriangleAlert size={15} /> Declare incident</button>} />
      <section className="incident-metrics metric-grid"><article className="metric-card"><span className="metric-icon green"><CheckCircle2 size={19} /></span><div><p>Resolved</p><strong>{data.incidents.filter((i) => i.status === "resolved").length}</strong><small>Scenario window</small></div></article><article className="metric-card"><span className="metric-icon amber"><Clock3 size={19} /></span><div><p>Mean mitigation</p><strong>7m</strong><small>Within 15m target</small></div></article><article className="metric-card"><span className="metric-icon violet"><FlaskConical size={19} /></span><div><p>Regression cases</p><strong>{data.incidents.filter((i) => i.regressionCaseId).length}</strong><small>100% linked</small></div></article><article className="metric-card"><span className="metric-icon blue"><Link2 size={19} /></span><div><p>Follow-up coverage</p><strong>100%</strong><small>No orphan incidents</small></div></article></section>
      <div className="incident-layout">
        <section className="panel incident-detail"><header><div><span className="severity sev3">{incident?.severity}</span><span className="mono-id">{incident?.id}</span><StatusPill status={incident?.status ?? "resolved"} /></div><small>Simulated production signal</small></header><h2>{incident?.title}</h2><p>{incident?.rootCause}</p><div className="incident-timeline"><article><span>18:25</span><i /><div><b>Detected</b><p>PostHog mock adapter observed duplicate <code>checkout_recovery_used</code> events.</p></div></article><article><span>18:27</span><i /><div><b>Classified</b><p>Incident agent reproduced the mobile viewport transition.</p></div></article><article><span>18:29</span><i /><div><b>Regression captured</b><p>{incident?.regressionCaseId} added to dataset dailycart-checkout@2.</p></div></article><article><span>18:32</span><i /><div><b>Resolved</b><p>Listener lifecycle corrected; case passed on rerun.</p></div></article></div></section>
        <aside className="incident-side"><section className="panel regression-card"><div className="regression-icon"><FlaskConical size={21} /></div><p className="eyebrow">Incident → eval</p><h2>{incident?.regressionCaseId}</h2><p>The production failure was converted into an executable deterministic case, not only a postmortem note.</p><dl><div><dt>Dataset</dt><dd>dailycart-checkout@2</dd></div><div><dt>Category</dt><dd>regression</dd></div><div><dt>Critical</dt><dd>No</dd></div><div><dt>Latest</dt><dd className="green-text">Passed</dd></div></dl><Link href="/evals">Open eval case <ArrowRight size={14} /></Link></section><section className="panel feedback-loop"><HeartPulse size={20} /><div><b>Feedback loop closed</b><p>INC-0001 → EVALCASE-0031 → RUN-0006 → EVAL-0003</p></div></section></aside>
      </div>
    </div>
  );
}
