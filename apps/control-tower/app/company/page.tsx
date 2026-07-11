import { BookOpenText, Database, FileJson2, FolderSearch, MessageSquareText, TicketCheck, Users } from "lucide-react";
import Link from "next/link";
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

const records = [
  { id: "EVD-0003", collection: "Research", source: "Interview transcript", title: "Checkout recovery after an interruption", summary: "I retried checkout three times but never knew what to fix. I expected the cart to survive the timeout.", sentiment: "Negative", linked: "FEAT-0001" },
  { id: "EVD-0011", collection: "Support", source: "Support ticket", title: "Address validation loop on mobile", summary: "The address error returned after every retry and did not explain which field needed attention.", sentiment: "Negative", linked: "FEAT-0001" },
  { id: "EVD-0024", collection: "Requests + bugs", source: "Analytics note", title: "Validation failures exit quickly", summary: "38% of validation failures exit within 20 seconds; observational data cannot isolate traffic mix from product friction.", sentiment: "Neutral", linked: "FEAT-0001" },
  { id: "EVD-0037", collection: "Research", source: "Survey response", title: "Clear guidance beats faster animation", summary: "Prefer clear error guidance over faster animation when a saved checkout needs recovery.", sentiment: "Mixed", linked: "FEAT-0001" }
];

export default async function CompanyPage() {
  const data = await loadDemoState();
  return (
    <div className="page-container">
      <PageHeading eyebrow="Synthetic evidence" title="Company data" description="A deterministic, internally linked DailyCart workspace with realistic noise and conflict." actions={<><ActionFeedbackButton>Validate references</ActionFeedbackButton><ActionFeedbackButton className="button primary">Regenerate seed</ActionFeedbackButton></>} />
      <section className="company-hero panel"><div><span className="company-big-avatar">DC</span><div><span className="source-label">100% synthetic</span><h2>DailyCart Commerce</h2><p>Make everyday shopping predictable, fast, and trustworthy across devices.</p></div></div><dl><div><dt>Scenario</dt><dd>{data.scenario}</dd></div><div><dt>Seed</dt><dd>{data.seed}</dd></div><div><dt>Generated</dt><dd>{new Date(data.generatedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</dd></div></dl></section>
      <div className="company-layout"><section className="collection-grid">{collections.map(([name, count, detail, Icon]) => <Link href="#collection-preview" className="panel collection-card" key={name} aria-label={`Open ${name} collection`}><span><Icon size={19} /></span><div><small>Collection</small><h2>{name}</h2><p>{detail}</p></div><strong>{count}</strong></Link>)}</section><aside className="panel strategy-card"><div className="section-title"><div><p className="eyebrow">Q3 strategy</p><h2>Trust every checkout</h2></div></div><p>Reduce preventable abandonment without masking reliability problems.</p><h3>Quarterly goals</h3><ol><li><span>01</span><div><b>Improve checkout completion</b><small>Baseline 18.3% → target 21%</small></div></li><li><span>02</span><div><b>Protect peak reliability</b><small>Error-free sessions ≥ 98%</small></div></li><li><span>03</span><div><b>Reduce contact burden</b><small>Checkout support −15%</small></div></li></ol></aside></div>
      <section className="panel data-browser" id="collection-preview"><div className="section-title"><div><p className="eyebrow">Evidence browser</p><h2>Representative linked records</h2><p className="section-help">Synthetic records are deterministic and linked into the delivery graph. Select a row to inspect its lineage.</p></div><Link className="button secondary" href="#collection-preview"><FolderSearch size={14}/> Browse all files</Link></div><div className="record-preview-grid">{records.map((record) => <article className="record-preview" key={record.id}><div><span className="source-label">{record.collection}</span><Link href={`/lineage?focus=${record.id}`} className="mono-id">{record.id}</Link></div><h3>{record.title}</h3><p>{record.summary}</p><small>{record.source} · {record.sentiment} · linked to <Link href={`/lineage?focus=${record.linked}`}>{record.linked}</Link></small></article>)}</div><div className="data-table"><div><span>ID</span><span>Source</span><span>Signal</span><span>Sentiment</span><span>Linked feature</span></div>{records.map((record) => <Link className="data-row-link" href={`/lineage?focus=${record.id}`} key={record.id}><span className="mono-id">{record.id}</span><span>{record.source}</span><span>{record.summary}</span><span>{record.sentiment}</span><span className="mono-id">{record.linked}</span></Link>)}</div></section>
    </div>
  );
}
