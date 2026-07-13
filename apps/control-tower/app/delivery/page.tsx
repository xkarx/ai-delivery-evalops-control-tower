import { ArrowUpRight, CircleDot, GitBranch, Link2, UserRound } from "lucide-react";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";
import { loadDemoState } from "@/lib/load-demo-state";
import { getRuntimeMode } from "@/lib/runtime-mode";
import { DeliverySyncAction } from "./sync-action";
import { loadDeliveryBacklog, loadDeliveryFeatures } from "@/lib/load-delivery-backlog";
import type { Ticket } from "@dailycart/schemas";
import { readArtifact } from "@/lib/durable-artifacts";
import { DeliveryProviderActivity } from "./provider-activity";
import { serverSessionId } from "@/lib/demo-session";
import { SessionStageBanner } from "@/app/ui/session-stage-banner";

type SyncRecord = { internalId: string; externalId: string; identifier: string; url: string; sourceMode: string; status: string; metadata?: { owner?: string } };

async function loadSyncRecords(sessionId?: string): Promise<SyncRecord[]> {
  try {
    const parsed = sessionId ? await readArtifact<{ records?: SyncRecord[] }>("linearSync", sessionId) : undefined;
    return parsed?.records ?? [];
  } catch {
    return [];
  }
}

const columns = [
  { key: "done", title: "Completed", hint: "Released or accepted" },
  { key: "in_progress", title: "Active", hint: "Agents are executing" },
  { key: "in_review", title: "Review", hint: "Awaiting evidence or approval" },
  { key: "todo", title: "Backlog", hint: "Ready to be picked up" },
  { key: "blocked", title: "Blocked", hint: "Dependency or gate required" }
] as const;

export const dynamic = "force-dynamic";

function deliveryStatus(ticket: Ticket, tickets: Ticket[]): Ticket["status"] {
  if (ticket.status === "todo" && ticket.dependsOn.some((dependency) => tickets.find((candidate) => candidate.id === dependency)?.status !== "done")) return "blocked";
  return ticket.status;
}

export default async function DeliveryPage() {
  const sessionId = await serverSessionId();
  const data = await loadDemoState(sessionId);
  const generatedTickets = sessionId ? [] : await loadDeliveryBacklog();
  const generatedFeatures = sessionId ? [] : await loadDeliveryFeatures();
  const tickets = sessionId ? data.tickets : generatedTickets.length ? generatedTickets : data.tickets;
  const features = sessionId ? data.features : [...data.features, ...generatedFeatures.filter((feature) => !data.features.some((candidate) => candidate.id === feature.id))];
  const synced = await loadSyncRecords(sessionId);
  const syncedById = new Map(synced.map((record) => [record.internalId, record]));
  const runtimeMode = getRuntimeMode();
  const ownerFor = (workstream: string) => ({ experience: "PM · Maya", reliability: "TPM · Noah", platform: "Engineering · Priya" }[workstream] ?? "Delivery team");
  return <div className="page-container delivery-page">
    <PageHeading eyebrow="Delivery operations" title="Linear delivery roadmap" description="One view of feature work, dependencies, ownership, evidence links, and the provider record that carries each ticket forward." actions={<DeliverySyncAction />} />
    <SessionStageBanner stage="plan_build" />
    <section className="delivery-summary metric-grid"><article className="metric-card"><span className="metric-icon violet"><GitBranch size={19} /></span><div><p>Total tickets</p><strong>{tickets.length}</strong><small>{synced.length ? `${synced.length} synced to Linear` : "Not synced yet"}</small></div></article><article className="metric-card"><span className="metric-icon green"><CircleDot size={19} /></span><div><p>Completed</p><strong>{tickets.filter((ticket) => ticket.status === "done").length}</strong><small>Acceptance criteria recorded</small></div></article><article className="metric-card"><span className="metric-icon blue"><UserRound size={19} /></span><div><p>Owners</p><strong>{new Set(tickets.map((ticket) => ownerFor(features.find((feature) => feature.id === ticket.featureId)?.workstream ?? ticket.workstream))).size}</strong><small>PM, TPM, and engineering</small></div></article><article className="metric-card"><span className="metric-icon amber"><Link2 size={19} /></span><div><p>Provider path</p><strong>{runtimeMode === "live" ? "Configured" : "Fallback"}</strong><small>{runtimeMode === "live" ? "External records prove each successful write" : "Deterministic records are labelled"}</small></div></article></section>
    <div className="delivery-board">{columns.map((column) => { const columnTickets = tickets.filter((ticket) => deliveryStatus(ticket, tickets) === column.key); return <section className="delivery-column" key={column.key}><header><div><h2>{column.title}</h2><p>{column.hint}</p></div><span>{columnTickets.length}</span></header><div className="delivery-stack">{columnTickets.map((ticket) => { const feature = features.find((candidate) => candidate.id === ticket.featureId); const external = syncedById.get(ticket.id); const owner = ownerFor(feature?.workstream ?? ticket.workstream); const status = deliveryStatus(ticket, tickets); return <article className="panel delivery-ticket" key={ticket.id}><div className="delivery-ticket-top"><span className="mono-id">{ticket.id}</span><StatusPill status={status} /></div><h3>{ticket.title}</h3><p>{ticket.description}</p><dl><div><dt>Owner</dt><dd>{owner}</dd></div><div><dt>Feature</dt><dd><a href={`/lineage?feature=${ticket.featureId}`}>{ticket.featureId}</a></dd></div><div><dt>Dependencies</dt><dd>{ticket.dependsOn.length ? ticket.dependsOn.join(", ") : "None"}</dd></div></dl><div className="delivery-ticket-meta"><span>{ticket.acceptanceCriteria.length} acceptance criteria</span>{external ? <a href={external.url} target="_blank" rel="noreferrer">{external.identifier} <ArrowUpRight size={13} /></a> : <span className="source-label">Not synced</span>}</div>{feature && <div className="delivery-evidence">{feature.evidenceIds.slice(0, 3).map((id) => <a href={`/lineage?focus=${id}`} key={id}>{id}</a>)}</div>}</article>; })}</div>{columnTickets.length === 0 && <p className="delivery-empty">No tickets in this state.</p>}</section>; })}</div>
    <p className="delivery-note">Statuses are sourced from persisted workflow state. Sync creates or updates Linear records with feature, approved brief, evidence, owner, dependency, and workflow metadata; a provider write only counts when its external identifier and URL are recorded.</p>
    <DeliveryProviderActivity />
  </div>;
}
