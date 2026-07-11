import { BookOpenText, Database, FileJson2, FolderSearch, MessageSquareText, TicketCheck, Users } from "lucide-react";
import { PageHeading } from "@/app/ui/page-heading";
import { loadDemoState } from "@/lib/load-demo-state";
import { ActionFeedbackButton } from "@/app/ui/action-feedback";

const collections = [
  ["Customers", "50", "Persistent accounts and persona links", Users],
  ["Research", "8", "Interview transcripts and summaries", BookOpenText],
  ["Support", "30", "Tickets with severity and evidence IDs", TicketCheck],
  ["Requests + bugs", "35", "Noisy, conflicting product signals", MessageSquareText],
  ["Eval cases", "31", "Versioned JSONL cases and labels", FileJson2],
  ["Operations", "13", "Releases, incidents, and decisions", Database]
] as const;

export default async function CompanyPage() {
  const data = await loadDemoState();
  return (
    <div className="page-container">
      <PageHeading eyebrow="Synthetic evidence" title="Company data" description="A deterministic, internally linked DailyCart workspace with realistic noise and conflict." actions={<><ActionFeedbackButton>Validate references</ActionFeedbackButton><ActionFeedbackButton className="button primary">Regenerate seed</ActionFeedbackButton></>} />
      <section className="company-hero panel"><div><span className="company-big-avatar">DC</span><div><span className="source-label">100% synthetic</span><h2>DailyCart Commerce</h2><p>Make everyday shopping predictable, fast, and trustworthy across devices.</p></div></div><dl><div><dt>Scenario</dt><dd>{data.scenario}</dd></div><div><dt>Seed</dt><dd>{data.seed}</dd></div><div><dt>Generated</dt><dd>{new Date(data.generatedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</dd></div></dl></section>
      <div className="company-layout"><section className="collection-grid">{collections.map(([name, count, detail, Icon]) => <article className="panel collection-card" key={name}><span><Icon size={19} /></span><div><small>Collection</small><h2>{name}</h2><p>{detail}</p></div><strong>{count}</strong></article>)}</section><aside className="panel strategy-card"><div className="section-title"><div><p className="eyebrow">Q3 strategy</p><h2>Trust every checkout</h2></div></div><p>Reduce preventable abandonment without masking reliability problems.</p><h3>Quarterly goals</h3><ol><li><span>01</span><div><b>Improve checkout completion</b><small>Baseline 18.3% → target 21%</small></div></li><li><span>02</span><div><b>Protect peak reliability</b><small>Error-free sessions ≥ 98%</small></div></li><li><span>03</span><div><b>Reduce contact burden</b><small>Checkout support −15%</small></div></li></ol></aside></div>
      <section className="panel data-browser"><div className="section-title"><div><p className="eyebrow">Evidence browser</p><h2>Representative linked records</h2></div><ActionFeedbackButton message="The V1 browser shows representative linked records. Full file browsing remains read-only until the evidence store is connected."><FolderSearch size={14}/> Browse all files</ActionFeedbackButton></div><div className="data-table"><div><span>ID</span><span>Source</span><span>Signal</span><span>Sentiment</span><span>Linked feature</span></div>{[
        ["EVD-0003","Interview","I retried checkout three times but never knew what to fix.","Negative","FEAT-0001"],
        ["EVD-0011","Support","Address validation loop on mobile checkout.","Negative","FEAT-0001"],
        ["EVD-0024","Analytics","38% of validation failures exit within 20 seconds.","Neutral","FEAT-0001"],
        ["EVD-0037","Survey","Prefer clear error guidance over faster animation.","Mixed","FEAT-0001"]
      ].map((row) => <div key={row[0]}>{row.map((cell, index) => <span key={cell} className={index === 0 || index === 4 ? "mono-id" : ""}>{cell}</span>)}</div>)}</div></section>
    </div>
  );
}
