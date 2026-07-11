import { ArrowRight, CheckCircle2, Scale, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { ActionFeedbackButton } from "@/app/ui/action-feedback";

const matrix = [
  { criterion: "Build + types", v1: 100, v2: 100, deterministic: true },
  { criterion: "Evidence grounding", v1: 92, v2: 92, deterministic: false },
  { criterion: "Keyboard focus", v1: 0, v2: 100, deterministic: true },
  { criterion: "Requirement coverage", v1: 88, v2: 96, deterministic: true },
  { criterion: "Trajectory policy", v1: 90, v2: 94, deterministic: true }
];

export default async function EvalsPage() {
  const data = await loadDemoState();
  const [blocked, passed] = data.campaigns;
  return (
    <div className="page-container">
      <PageHeading eyebrow="Quality operations" title="Eval campaigns" description="Versioned datasets, measured per-case results, human calibration, and release policy." actions={<><ActionFeedbackButton>New dataset</ActionFeedbackButton><ActionFeedbackButton className="button primary"><Sparkles size={15} /> Run campaign</ActionFeedbackButton></>} />
      <section className="recovery-banner"><div className="recovery-step failed"><XCircle size={20} /><div><span>Version 1</span><b>Release blocked</b><small>{blocked?.weightedScore} / 100</small></div></div><ArrowRight size={17} /><div className="recovery-change"><span>Correction</span><b>Focus-trap regression fixed</b><small>TKT-0002 · RUN-0003</small></div><ArrowRight size={17} /><div className="recovery-step passed"><CheckCircle2 size={20} /><div><span>Version 2</span><b>Gate passed</b><small>{passed?.weightedScore} / 100</small></div></div></section>
      <div className="eval-layout">
        <section className="panel eval-matrix-panel"><div className="section-title"><div><p className="eyebrow">Measured results</p><h2>Version comparison</h2></div><span className="source-label">Dataset dailycart-checkout@1</span></div><div className="eval-matrix"><div className="matrix-head"><span>Criterion</span><span>EVAL-0001</span><span>EVAL-0002</span><span>Grader</span></div>{matrix.map((row) => <div className="matrix-row" key={row.criterion}><b>{row.criterion}</b><span className={row.v1 < 85 ? "score-cell fail" : "score-cell pass"}>{row.v1}</span><span className={row.v2 < 85 ? "score-cell fail" : "score-cell pass"}>{row.v2}</span><small>{row.deterministic ? "Deterministic" : "Mocked AI judge"}</small></div>)}</div><div className="matrix-note"><ShieldAlert size={16} /><p><b>Why EVAL-0001 blocked:</b> critical cases override the weighted average. Keyboard focus scored 0, so release remained blocked despite other passing results.</p></div></section>
        <aside className="eval-side">
          <section className="panel gate-policy"><div className="section-title"><div><p className="eyebrow">Policy</p><h2>Release gate</h2></div><StatusPill status="passed" /></div>{["Critical deterministic checks", "No critical safety failures", "Weighted score ≥ 85", "Human approval present", "Regression delta in policy"].map((item, index) => <div className="gate-row" key={item}><CheckCircle2 size={16} /><span>{item}</span><b>{index === 2 ? "94" : "Pass"}</b></div>)}</section>
          <section className="panel taxonomy"><div className="section-title"><div><p className="eyebrow">Failure taxonomy</p><h2>Campaign findings</h2></div></div><div className="taxonomy-chart"><div style={{ width: "58%" }}><span>Accessibility</span><b>1</b></div><div style={{ width: "29%" }}><span>Grounding</span><b>0</b></div><div style={{ width: "20%" }}><span>Safety</span><b>0</b></div></div><p>1 failure found · 1 corrected · 0 unresolved</p></section>
        </aside>
      </div>
      <div className="eval-bottom">
        <section className="panel calibration-card"><Scale size={22} /><div><p className="eyebrow">Judge calibration</p><h2>Human versus AI agreement</h2><p>Mocked semantic judge is clearly labeled and calibrated against stored synthetic human labels.</p></div><div className="agreement-ring"><span>92<small>%</small></span><b>Agreement</b></div><dl><div><dt>False pass</dt><dd>2.1%</dd></div><div><dt>False block</dt><dd>3.4%</dd></div><div><dt>Review time</dt><dd>1m 18s</dd></div></dl><Link href="/reviews">Open reviews <ArrowRight size={14} /></Link></section>
      </div>
    </div>
  );
}
