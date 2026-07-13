import { Check, Clock3, MessageSquareText, Scale, UserCheck } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { ReviewDecision } from "./review-decision";
import { ApprovalPacket } from "./approval-packet";
import { serverSessionId } from "@/lib/demo-session";
import { SessionStageBanner } from "@/app/ui/session-stage-banner";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const sessionId = await serverSessionId();
  const data = await loadDemoState(sessionId);
  const pending = data.approvals.filter((approval) => approval.status === "pending");
  return <div className="page-container">
    <PageHeading eyebrow="Human control" title="Human review queue" description="Agents propose; authorized reviewers decide at feature, preview, and release boundaries." actions={<Link className="button secondary" href="/evals#eval-workbench"><Scale size={15} /> Calibration report</Link>} />
    <SessionStageBanner stage={pending.some((approval) => approval.stage === "release") ? "release_approval" : "feature_approval"} />
    <section className="review-metrics metric-grid">
      <article className="metric-card"><span className="metric-icon amber"><Clock3 size={19} /></span><div><p>Awaiting review</p><strong>{pending.length}</strong><small>Persisted approval gates</small></div></article>
      <article className="metric-card"><span className="metric-icon green"><UserCheck size={19} /></span><div><p>Resolved</p><strong>{data.approvals.filter((approval) => approval.status !== "pending").length}</strong><small>Rationales recorded</small></div></article>
      <article className="metric-card"><span className="metric-icon violet"><Scale size={19} /></span><div><p>Agent eval gate</p><strong>{data.campaigns.at(-1)?.weightedScore ?? 0}</strong><small>Current measured score</small></div></article>
      <article className="metric-card"><span className="metric-icon blue"><MessageSquareText size={19} /></span><div><p>Decision boundary</p><strong>Human</strong><small>No automatic release</small></div></article>
    </section>
    <section className="panel review-story" aria-label="Human decision gates">
      <div id="feature-gate"><span>Feature gate</span><b>Evidence, specialist reviews, and agent evals</b><small>Approves what enters delivery.</small></div>
      <i aria-hidden="true" />
      <div id="release-gate"><span>Release gate</span><b>Preview, checks, and critical eval results</b><small>Approves what reaches production.</small></div>
    </section>
    <ApprovalPacket />
    <div className="review-layout">
      <section className="review-queue">
        {pending.map((approval) => {
          const feature = data.features.find((item) => item.id === approval.featureId);
          return <article className="panel review-card pending-review" key={approval.id}>
            <header><div><span className="mono-id">{approval.id}</span><StatusPill status="pending" /></div><small>{approval.stage} approval · {new Date(approval.requestedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</small></header>
            <h2>{feature?.title ?? approval.featureId}</h2>
            <p>{feature?.problem ?? "Review the evidence, current preview, and release policy before deciding."}</p>
            <div className="review-evidence"><div><span>Feature</span><b>{approval.featureId}</b></div><div><span>Evidence</span><b>{feature?.evidenceIds.length ?? 0} linked</b></div><div><span>Gate</span><b>{approval.stage}</b></div></div>
            <ReviewDecision approvalId={approval.id} stage={approval.stage} />
          </article>;
        })}
        {!pending.length && <section className="panel empty-state"><Check size={18} /><h2>No decisions waiting</h2><p>Start or resume the workflow to create the next human approval gate.</p><Link className="button primary" href="/runs">Open agent workflow</Link></section>}
      </section>
      <aside className="panel decision-log"><div className="section-title"><div><p className="eyebrow">Audit history</p><h2>Recent decisions</h2></div></div>{data.approvals.filter((approval) => approval.status !== "pending").map((approval) => <article key={approval.id}><span className="decision-icon"><Check size={13} /></span><div><div><b>{approval.stage} {approval.status}</b><span className="mono-id">{approval.id}</span></div><p>{approval.rationale}</p><small>{approval.reviewer} · {approval.resolvedAt ? new Date(approval.resolvedAt).toLocaleString("en-US", { timeZone: "UTC" }) : "Pending"}</small></div></article>)}</aside>
    </div>
  </div>;
}
