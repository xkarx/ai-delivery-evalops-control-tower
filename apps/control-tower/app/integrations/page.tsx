import { KeyRound } from "lucide-react";
import { loadDemoState } from "@/lib/load-demo-state";
import { PageHeading } from "@/app/ui/page-heading";
import { HealthClient, type HealthProviderView } from "./health-client";

export default async function IntegrationsPage() {
  const data = await loadDemoState();
  const initial: HealthProviderView[] = data.integrations.map((integration) => ({
    key: integration.provider === "workflow" ? "inngest" : integration.provider === "deployment" ? "vercel" : integration.provider,
    provider: integration.provider,
    configuration: { configured: true, writeEnabled: false, missingEnvironment: [], message: integration.message },
    health: integration
  }));
  return (
    <div className="page-container">
      <PageHeading eyebrow="Provider adapters" title="Integration health" description="Safe read-only health checks run before writes. Demo mode stays operational with no credentials." />
      <HealthClient initial={initial} />
      <section className="panel connection-note"><KeyRound size={20} /><div><h2>Ready for connected mode</h2><p>Add credentials through your deployment secret store, set <code>INTEGRATION_MODE=live</code>, and run the read-only health checks above before enabling provider writes.</p></div></section>
    </div>
  );
}
