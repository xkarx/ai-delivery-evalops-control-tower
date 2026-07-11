"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { IntegrationHealth } from "@dailycart/schemas";
import { StatusPill } from "@/app/ui/status-pill";

export interface HealthProviderView {
  key: string;
  provider: IntegrationHealth["provider"];
  configuration: { configured: boolean; writeEnabled: boolean; missingEnvironment: string[]; message: string };
  health: IntegrationHealth;
}

const descriptions: Record<string, string> = {
  github: "Issues, branches, pull requests, checks, and release links",
  slack: "Workflow commands, approvals, questions, and alerts",
  "issue-tracker": "Linear projects and GitHub Issues fallback",
  supabase: "Shared workflow state, external references, and lineage",
  langfuse: "Agent traces, datasets, experiments, scores, cost, and latency",
  posthog: "Product events, funnels, feature exposure, and adoption",
  vercel: "Preview and production deployment records",
  inngest: "Workflow events, waits, retries, and resumptions",
  "sample-product": "Online Boutique contract, traffic, and teardown controls"
};

export function HealthClient({ initial }: { initial: HealthProviderView[] }) {
  const [providers, setProviders] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | undefined>();

  async function checkAll(): Promise<void> {
    setChecking(true);
    try {
      const response = await fetch("/api/integrations/health", { cache: "no-store" });
      if (!response.ok) throw new Error(`Health check failed with HTTP ${response.status}`);
      const result = await response.json() as { providers: HealthProviderView[]; checkedAt: string };
      setProviders(result.providers);
      setLastChecked(result.checkedAt);
    } finally {
      setChecking(false);
    }
  }

  const healthy = providers.filter((provider) => provider.health.status === "healthy").length;
  const mode = providers[0]?.health.mode ?? "mock";

  return <>
    <section className="mode-summary panel"><div><span className="metric-icon green"><RefreshCw size={19} /></span><div><b>{mode === "live" ? "Live adapter health" : "Credential-free demo is healthy"}</b><p>{mode === "live" ? "Read-only checks are running against configured providers." : "All actions below are deterministic mock provider calls."}</p></div></div><div className="mode-summary-actions"><StatusPill status={healthy === providers.length ? "healthy" : "degraded"} label={`${healthy}/${providers.length} healthy`} /><button className="button secondary" onClick={checkAll} disabled={checking}><RefreshCw size={15} className={checking ? "spin" : ""} /> {checking ? "Checking…" : "Check all"}</button></div></section>
    {lastChecked && <p className="health-timestamp">Last checked {new Date(lastChecked).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p>}
    <section className="integration-grid">
      {providers.map((integration) => <article className="integration-card" key={integration.key}>
        <div className="integration-top"><span className="provider-logo">{integration.key.slice(0, 2).toUpperCase()}</span><StatusPill status={integration.health.status} /></div>
        <h2>{integration.key.replace("-", " ")}</h2><p>{descriptions[integration.key] ?? integration.health.message}</p>
        <dl><div><dt>Mode</dt><dd className="source-label">{integration.health.mode}</dd></div><div><dt>Configuration</dt><dd>{integration.configuration.configured ? "Ready" : "Missing"}</dd></div><div><dt>Write path</dt><dd>{integration.configuration.writeEnabled ? "Configured" : "Blocked"}</dd></div></dl>
        <div className="capability-row">{integration.health.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
        <div className="integration-message">{integration.health.message}{integration.configuration.missingEnvironment.length > 0 && <small>Missing: {integration.configuration.missingEnvironment.join(", ")}</small>}</div>
      </article>)}
    </section>
  </>;
}
