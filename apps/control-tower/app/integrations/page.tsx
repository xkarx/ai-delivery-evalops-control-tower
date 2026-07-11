import { Check, ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import { loadDemoState } from "@/lib/load-demo-state";
import { PageHeading } from "@/app/ui/page-heading";
import { StatusPill } from "@/app/ui/status-pill";

const descriptions: Record<string, string> = {
  github: "Issues, branches, pull requests, checks, and release links",
  slack: "Workflow commands, approvals, questions, and alerts",
  linear: "Projects, tickets, dependencies, and status synchronization",
  supabase: "Shared workflow state, external references, and lineage",
  langfuse: "Agent traces, datasets, experiments, scores, cost, and latency",
  posthog: "Product events, funnels, feature exposure, and adoption",
  deployment: "Preview and production deployment records",
  workflow: "Durable workflow events, waits, retries, and resumptions",
  "sample-product": "Online Boutique contract, traffic, and teardown controls"
};

export default async function IntegrationsPage() {
  const data = await loadDemoState();
  return (
    <div className="page-container">
      <PageHeading eyebrow="Provider adapters" title="Integration health" description="Safe health checks run before writes. Demo mode stays operational with no credentials." actions={<button className="button secondary"><RefreshCw size={15} /> Check all</button>} />
      <section className="mode-summary panel"><div><span className="metric-icon green"><Check size={19} /></span><div><b>Credential-free demo is healthy</b><p>All actions below are normalized, deterministic mock provider calls.</p></div></div><StatusPill status="healthy" label={`${data.integrations.length} adapters ready`} /></section>
      <section className="integration-grid">
        {data.integrations.map((integration) => (
          <article className="integration-card" key={integration.provider}>
            <div className="integration-top"><span className="provider-logo">{integration.provider.slice(0, 2).toUpperCase()}</span><StatusPill status={integration.status} /></div>
            <h2>{integration.provider.replace("-", " ")}</h2><p>{descriptions[integration.provider]}</p>
            <dl><div><dt>Mode</dt><dd className="source-label">{integration.mode}</dd></div><div><dt>Last check</dt><dd>{new Date(integration.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC</dd></div></dl>
            <div className="capability-row">{integration.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
            <div className="card-actions"><button><RefreshCw size={14} /> Test health</button><button><KeyRound size={14} /> Setup <ExternalLink size={12} /></button></div>
          </article>
        ))}
      </section>
      <section className="panel connection-note"><KeyRound size={20} /><div><h2>Ready for connected mode</h2><p>Add credentials through your deployment secret store, set <code>INTEGRATION_MODE=live</code>, and run read-only health checks before enabling provider writes. No application code changes are needed.</p></div></section>
    </div>
  );
}
