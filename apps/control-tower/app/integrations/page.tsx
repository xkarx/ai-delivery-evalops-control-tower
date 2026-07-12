import { KeyRound } from "lucide-react";
import { createConnectorSuite, type BaseAdapter } from "@dailycart/connectors";
import { createSampleProductAdapter } from "@dailycart/sample-product";
import { loadDemoState } from "@/lib/load-demo-state";
import { PageHeading } from "@/app/ui/page-heading";
import { HealthClient, type HealthProviderView } from "./health-client";

export const dynamic = "force-dynamic";

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
  const adapters: BaseAdapter[] = [suite.codeHost, suite.chat, suite.issueTracker, suite.database, suite.trace, suite.productAnalytics, suite.deployment, suite.workflow, createSampleProductAdapter({ env: process.env })];
  const viewKey = (adapter: BaseAdapter): string => {
    if (adapter.provider === "workflow") return "inngest";
    if (adapter.provider === "sample-product") return "sample-product";
    if (adapter.kind === "code-host") return "github";
    if (adapter.kind === "issue-tracker") return "issue-tracker";
    if (adapter.kind === "chat") return "slack";
    if (adapter.kind === "trace") return "langfuse";
    if (adapter.kind === "product-analytics") return "posthog";
    if (adapter.kind === "database") return "supabase";
    if (adapter.kind === "deployment") return "vercel";
    return adapter.provider;
  };
  const liveHealth = await Promise.all(adapters.map(async (adapter) => ({ adapter, health: await adapter.healthCheck() })));
  const lastActions = new Map(data.activity.map((item) => [item.type, { label: item.title, at: item.at, sourceMode: data.sourceMode, url: undefined }]));
  const healthByKey = new Map(liveHealth.map(({ adapter, health }) => [viewKey(adapter), health]));
  const initial: HealthProviderView[] = data.integrations.map((integration) => ({
    key: integration.provider === "workflow" ? "inngest" : integration.provider === "deployment" ? "vercel" : integration.provider,
    provider: integration.provider,
    configuration: configured.get(integration.provider === "workflow" ? "inngest" : integration.provider === "deployment" ? "vercel" : integration.provider) ?? { configured: true, writeEnabled: false, missingEnvironment: [], message: integration.message },
    health: healthByKey.get(integration.provider === "workflow" ? "inngest" : integration.provider === "deployment" ? "vercel" : integration.provider) ?? { ...integration, mode: process.env.INTEGRATION_MODE === "live" ? "live" : "mock" },
    lastAction: lastActions.get(integration.provider === "deployment" ? "deployment" : integration.provider)
  }));
  return (
    <div className="page-container">
      <PageHeading eyebrow="Provider adapters" title="Integration health" description="Safe read-only health checks run before writes. Demo mode stays operational with no credentials." />
      <HealthClient initial={initial} />
      <section className="panel connection-note"><KeyRound size={20} /><div><h2>Ready for connected mode</h2><p>Add credentials through your deployment secret store, set <code>INTEGRATION_MODE=live</code>, and run the read-only health checks above before enabling provider writes.</p></div></section>
    </div>
  );
}
