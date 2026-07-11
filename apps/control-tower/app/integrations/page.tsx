import { KeyRound } from "lucide-react";
import { createConnectorSuite } from "@dailycart/connectors";
import { createSampleProductAdapter } from "@dailycart/sample-product";
import { loadDemoState } from "@/lib/load-demo-state";
import { PageHeading } from "@/app/ui/page-heading";
import { HealthClient, type HealthProviderView } from "./health-client";

export default async function IntegrationsPage() {
  const data = await loadDemoState();
  const suite = createConnectorSuite({ env: process.env });
  const configured = new Map<string, ReturnType<typeof suite.codeHost.configurationStatus>>([
    ["github", suite.codeHost.configurationStatus()],
    ["slack", suite.chat.configurationStatus()],
    ["issue-tracker", suite.issueTracker.configurationStatus()],
    ["supabase", suite.database.configurationStatus()],
    ["langfuse", suite.trace.configurationStatus()],
    ["posthog", suite.productAnalytics.configurationStatus()],
    ["vercel", suite.deployment.configurationStatus()],
    ["inngest", suite.workflow.configurationStatus()],
    ["sample-product", createSampleProductAdapter({ env: process.env }).configurationStatus()]
  ]);
  const initial: HealthProviderView[] = data.integrations.map((integration) => ({
    key: integration.provider === "workflow" ? "inngest" : integration.provider === "deployment" ? "vercel" : integration.provider,
    provider: integration.provider,
    configuration: configured.get(integration.provider === "workflow" ? "inngest" : integration.provider === "deployment" ? "vercel" : integration.provider) ?? { configured: true, writeEnabled: false, missingEnvironment: [], message: integration.message },
    health: { ...integration, mode: process.env.INTEGRATION_MODE === "live" ? "live" : "mock", status: process.env.INTEGRATION_MODE === "live" && !(configured.get(integration.provider)?.configured ?? true) ? "unconfigured" : integration.status, message: process.env.INTEGRATION_MODE === "live" ? "Configured state loaded; run Check all for a live read-only probe." : integration.message }
  }));
  return (
    <div className="page-container">
      <PageHeading eyebrow="Provider adapters" title="Integration health" description="Safe read-only health checks run before writes. Demo mode stays operational with no credentials." />
      <HealthClient initial={initial} />
      <section className="panel connection-note"><KeyRound size={20} /><div><h2>Ready for connected mode</h2><p>Add credentials through your deployment secret store, set <code>INTEGRATION_MODE=live</code>, and run the read-only health checks above before enabling provider writes.</p></div></section>
    </div>
  );
}
