import { createConnectorSuite, resolveIntegrationMode, type BaseAdapter } from "@dailycart/connectors";
import { createSampleProductAdapter } from "@dailycart/sample-product";

export const dynamic = "force-dynamic";

function viewKey(adapter: BaseAdapter): string {
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
}

export async function GET(): Promise<Response> {
  const suite = createConnectorSuite({ env: process.env, timeoutMs: 8_000 });
  const adapters: BaseAdapter[] = [
    suite.codeHost,
    suite.chat,
    suite.issueTracker,
    suite.database,
    suite.trace,
    suite.productAnalytics,
    suite.deployment,
    suite.workflow,
    createSampleProductAdapter({ env: process.env, timeoutMs: 8_000 })
  ];
  const providers = await Promise.all(adapters.map(async (adapter) => ({
    key: viewKey(adapter),
    provider: adapter.provider,
    configuration: adapter.configurationStatus(),
    health: await adapter.healthCheck()
  })));
  return Response.json({ mode: resolveIntegrationMode(process.env), checkedAt: new Date().toISOString(), providers });
}
