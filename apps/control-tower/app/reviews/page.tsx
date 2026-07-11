import { Check, Clock3, MessageSquareText, Scale, UserCheck, X } from "lucide-react";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { ActionFeedbackButton } from "@/app/ui/action-feedback";

export default async function ReviewsPage() {
  const data = await loadDemoState();
  return (
    <div className="page-container">
      <PageHeading eyebrow="Human control" title="Human review queue" description="Agents propose; authorized reviewers decide at feature, preview, and release boundaries." actions={<ActionFeedbackButton><Scale size={15} /> Calibration report</ActionFeedbackButton>} />
      <section className="review-metrics metric-grid"><article className="metric-card"><span className="metric-icon amber"><Clock3 size={19} /></span><div><p>Awaiting review</p><strong>2</strong><small>Oldest: 14 minutes</small></div></article><article className="metric-card"><span className="metric-icon green"><UserCheck size={19} /></span><div><p>Resolved today</p><strong>{data.approvals.filter((a) => a.status === "approved").length}</strong><small>All rationales recorded</small></div></article><article className="metric-card"><span className="metric-icon violet"><Scale size={19} /></span><div><p>AI agreement</p><strong>92%</strong><small>Against synthetic human labels</small></div></article><article className="metric-card"><span className="metric-icon blue"><MessageSquareText size={19} /></span><div><p>Median review</p><strong>1m 18s</strong><small>Within 15m target</small></div></article></section>
      <div className="review-layout">
        <section className="review-queue">
          <article className="panel review-card pending-review"><header><div><span className="mono-id">APR-0003</span><StatusPill status="pending" /></div><small>Preview approval · 14m ago</small></header><h2>Recommendation timeout isolation</h2><p>Preview is ready. The release agent requests confirmation that fallback behavior matches the approved acceptance criteria.</p><div className="review-evidence"><div><span>Eval score</span><b>89 / 100</b></div><div><span>Critical failures</span><b>0</b></div><div><span>Linked evidence</span><b>2 records</b></div></div><label>Decision rationale<textarea placeholder="Required for approval or rejection" /></label><div className="review-actions"><ActionFeedbackButton className="reject"><X size={15} /> Reject</ActionFeedbackButton><ActionFeedbackButton className="approve"><Check size={15} /> Approve preview</ActionFeedbackButton></div></article>
          <article className="panel review-card"><header><div><span className="mono-id">APR-0004</span><StatusPill status="pending" /></div><small>Feature approval · 4m ago</small></header><h2>Cart price-change transparency</h2><p>PM analysis found three evidence sources, but confidence is below the automatic recommendation threshold.</p><div className="review-evidence"><div><span>Opportunity</span><b>78 / 100</b></div><div><span>Confidence</span><b>73%</b></div><div><span>Linked evidence</span><b>3 records</b></div></div><div className="review-actions"><ActionFeedbackButton>Open evidence</ActionFeedbackButton><ActionFeedbackButton className="button primary">Review decision</ActionFeedbackButton></div></article>
        </section>
        <aside className="panel decision-log"><div className="section-title"><div><p className="eyebrow">Audit history</p><h2>Recent decisions</h2></div></div>{data.approvals.map((approval) => <article key={approval.id}><span className="decision-icon"><Check size={13} /></span><div><div><b>{approval.stage} approved</b><span className="mono-id">{approval.id}</span></div><p>{approval.rationale}</p><small>{approval.reviewer} · {approval.resolvedAt ? new Date(approval.resolvedAt).toLocaleString("en-US", { timeZone: "UTC" }) : "Pending"}</small></div></article>)}</aside>
      </div>
    </div>
  );
}
