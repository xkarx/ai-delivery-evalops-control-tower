import { KeyRound } from "lucide-react";
import { createConnectorSuite, type BaseAdapter } from "@dailycart/connectors";
import { createSampleProductAdapter } from "@dailycart/sample-product";
import { loadDemoState } from "@/lib/load-demo-state";
import { PageHeading } from "@/app/ui/page-heading";
import { HealthClient, type HealthProviderView } from "./health-client";
import { readArtifact } from "@/lib/durable-artifacts";

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
  const [sync, preview, productEvents, receipts] = await Promise.all([
    readArtifact<{ ticketRecords?: Array<{ identifier: string; url: string; sourceMode: string }>; notification?: { url: string; sourceMode: string }; trace?: { url: string; sourceMode: string }; workflowEvent?: { url: string; sourceMode: string } }>("workflowSync"),
    readArtifact<{ builds?: Array<{ commitUrl: string; pullRequestUrl: string; deploymentUrl: string; sourceMode: string; createdAt: string }> }>("workflowPreview"),
    readArtifact<Array<{ id: string; timestamp: string; sourceMode: string }>>("productEvents"),
    readArtifact<Array<{ message: string; at: string; sourceMode: string; deepLink: string }>>("actionReceipts")
  ]);
  const latestBuild = preview?.builds?.at(-1); const latestEvent = productEvents?.at(-1); const latestReceipt = receipts?.at(-1);
  const lastActions = new Map<string, { label: string; at: string; sourceMode: string; url?: string }>();
  if (latestBuild) { lastActions.set("github", { label: "Product branch, commit, and PR created", at: latestBuild.createdAt, sourceMode: latestBuild.sourceMode, url: latestBuild.pullRequestUrl }); lastActions.set("vercel", { label: "Product preview deployed", at: latestBuild.createdAt, sourceMode: latestBuild.sourceMode, url: latestBuild.deploymentUrl }); }
  if (sync?.ticketRecords?.length) { const ticket = sync.ticketRecords.at(-1)!; lastActions.set("issue-tracker", { label: `${ticket.identifier} synchronized`, at: latestReceipt?.at ?? data.generatedAt, sourceMode: ticket.sourceMode, url: ticket.url }); }
  if (sync?.notification) lastActions.set("slack", { label: "Workflow handoff posted", at: latestReceipt?.at ?? data.generatedAt, sourceMode: sync.notification.sourceMode, url: sync.notification.url });
  if (sync?.trace) lastActions.set("langfuse", { label: "Workflow trace and score recorded", at: latestReceipt?.at ?? data.generatedAt, sourceMode: sync.trace.sourceMode, url: sync.trace.url });
  if (sync?.workflowEvent) lastActions.set("inngest", { label: "Workflow event accepted", at: latestReceipt?.at ?? data.generatedAt, sourceMode: sync.workflowEvent.sourceMode, url: sync.workflowEvent.url });
  if (latestEvent) { lastActions.set("posthog", { label: `Product event ${latestEvent.id} captured`, at: latestEvent.timestamp, sourceMode: latestEvent.sourceMode }); lastActions.set("sample-product", { label: "Bounded product activity persisted", at: latestEvent.timestamp, sourceMode: latestEvent.sourceMode }); }
  if (latestReceipt) lastActions.set("supabase", { label: latestReceipt.message, at: latestReceipt.at, sourceMode: latestReceipt.sourceMode, url: latestReceipt.deepLink });
  const healthByKey = new Map(liveHealth.map(({ adapter, health }) => [viewKey(adapter), health]));
  const initial: HealthProviderView[] = data.integrations.map((integration) => { const key = integration.provider === "linear" ? "issue-tracker" : integration.provider === "workflow" ? "inngest" : integration.provider === "deployment" ? "vercel" : integration.provider; return ({
    key,
    provider: integration.provider,
    configuration: configured.get(key) ?? { configured: true, writeEnabled: false, missingEnvironment: [], message: integration.message },
    health: healthByKey.get(key) ?? { ...integration, mode: process.env.INTEGRATION_MODE === "live" ? "live" : "mock" },
    lastAction: lastActions.get(key)
  }); });
  return (
    <div className="page-container">
      <PageHeading eyebrow="Provider adapters" title="Integration health" description="Safe read-only health checks run before writes. Demo mode stays operational with no credentials." />
      <HealthClient initial={initial} />
      <section className="panel connection-note"><KeyRound size={20} /><div><h2>Ready for connected mode</h2><p>Add credentials through your deployment secret store, set <code>INTEGRATION_MODE=live</code>, and run the read-only health checks above before enabling provider writes.</p></div></section>
    </div>
  );
}
