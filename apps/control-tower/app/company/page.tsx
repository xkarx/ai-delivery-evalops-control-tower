import { BookOpenText, Database, FileJson2, MessageSquareText, TicketCheck, Users } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/app/ui/page-heading";
import { loadDemoState } from "@/lib/load-demo-state";
import { loadCompanyContextPack } from "@dailycart/agents";
import path from "node:path";
import { CompanyActions } from "./company-actions";

const collections = [
  ["Customers", "50", "Persistent accounts and persona links", Users],
  ["Research", "8", "Interview transcripts and summaries", BookOpenText],
  ["Support", "30", "Tickets with severity and evidence IDs", TicketCheck],
  ["Requests + bugs", "35", "Noisy, conflicting product signals", MessageSquareText],
  ["Eval cases", "31", "Versioned JSONL cases and labels", FileJson2],
  ["Operations", "13", "Releases, incidents, and decisions", Database]
] as const;

export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  const data = await loadDemoState();
  const contextPack = await loadCompanyContextPack(path.resolve(process.cwd(), "../.."));
  const records = contextPack.evidence.map((record) => ({ id: record.id, collection: record.kind, source: record.kind, title: record.title, summary: record.summary, sentiment: record.sentiment ?? "neutral", linked: record.tags?.includes("cart-persistence") ? "FEAT-0002" : "FEAT-0001", occurredAt: record.occurredAt, customerId: record.customerId, tags: record.tags }));
  return (
    <div className="page-container">
      <PageHeading eyebrow="Synthetic evidence" title="Company data" description="A deterministic, internally linked DailyCart workspace with realistic noise and conflict." actions={<CompanyActions />} />
      <section className="company-hero panel"><div><span className="company-big-avatar">DC</span><div><span className="source-label">100% synthetic</span><h2>DailyCart Commerce</h2><p>Make everyday shopping predictable, fast, and trustworthy across devices.</p></div></div><dl><div><dt>Scenario</dt><dd>{data.scenario}</dd></div><div><dt>Seed</dt><dd>{data.seed}</dd></div><div><dt>Generated</dt><dd>{new Date(data.generatedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</dd></div></dl></section>
      <div className="company-layout"><section className="collection-grid">{collections.map(([name, count, detail, Icon]) => <Link href="#collection-preview" className="panel collection-card" key={name} aria-label={`Open ${name} collection`}><span><Icon size={19} /></span><div><small>Collection</small><h2>{name}</h2><p>{detail}</p></div><strong>{count}</strong></Link>)}</section><aside className="panel strategy-card"><div className="section-title"><div><p className="eyebrow">Q3 strategy</p><h2>Trust every checkout</h2></div></div><p>Reduce preventable abandonment without masking reliability problems.</p><h3>Quarterly goals</h3><ol><li><span>01</span><div><b>Improve checkout completion</b><small>Baseline 18.3% → target 21%</small></div></li><li><span>02</span><div><b>Protect peak reliability</b><small>Error-free sessions ≥ 98%</small></div></li><li><span>03</span><div><b>Reduce contact burden</b><small>Checkout support −15%</small></div></li></ol></aside></div>
      <section className="panel context-pack"><div className="section-title"><div><p className="eyebrow">Agent context</p><h2>Company context pack</h2><p className="section-help">Version {contextPack.version} · {contextPack.evidenceIds.length} evidence IDs · seed {contextPack.manifest.seed}</p></div><span className="source-label">{contextPack.sourceMode}</span></div><div className="context-category-grid">{contextPack.categories.map((category) => <Link href="#collection-preview" className="context-category" key={category.id}><b>{category.label}</b><span>{category.files.length} files</span><small>{category.files.slice(0, 2).join(" · ")}</small></Link>)}</div></section>
      <section className="panel data-browser" id="collection-preview"><div className="section-title"><div><p className="eyebrow">Evidence browser</p><h2>Versioned linked records</h2><p className="section-help">Open any record to inspect its full synthetic source detail, identifiers, tags, and feature lineage.</p></div><span className="source-label">{records.length} records loaded</span></div><div className="record-preview-grid">{records.map((record) => <details className="record-preview" key={record.id}><summary><div><span className="source-label">{record.collection}</span><span className="mono-id">{record.id}</span></div><h3>{record.title}</h3><p>{record.summary}</p></summary><dl><div><dt>Occurred</dt><dd>{new Date(record.occurredAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</dd></div><div><dt>Customer</dt><dd>{record.customerId ?? "Aggregate signal"}</dd></div><div><dt>Tags</dt><dd>{record.tags?.join(", ") || "none"}</dd></div><div><dt>Used by</dt><dd><Link href={`/lineage?focus=${record.id}`}>{record.linked} lineage</Link></dd></div></dl><small>{record.source} · {record.sentiment} · context pack {contextPack.version}</small></details>)}</div><div className="data-table"><div><span>ID</span><span>Source</span><span>Signal</span><span>Sentiment</span><span>Linked feature</span></div>{records.map((record) => <Link className="data-row-link" href={`/lineage?focus=${record.id}`} key={record.id}><span className="mono-id">{record.id}</span><span>{record.source}</span><span>{record.summary}</span><span>{record.sentiment}</span><span className="mono-id">{record.linked}</span></Link>)}</div></section>
    </div>
  );
}
