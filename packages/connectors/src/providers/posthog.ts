import { productEventSchema, type IntegrationHealth, type ProductEvent } from "@dailycart/schemas";
import { BaseConnector } from "../base";
import { jsonHeaders, requestJson } from "../http";
import type {
  AdapterRuntime,
  ExternalReference,
  FunnelResult,
  FunnelStage,
  ProductAnalyticsAdapter
} from "../types";

export function computeFunnel(
  allEvents: ProductEvent[],
  stages: FunnelStage[],
  sourceMode: FunnelResult["sourceMode"],
  from?: string,
  to?: string,
  externalUrl?: string
): FunnelResult {
  const fromMs = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
  const toMs = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;
  const events = allEvents.filter((event) => {
    const timestamp = new Date(event.timestamp).getTime();
    return timestamp >= fromMs && timestamp <= toMs;
  });
  const byCustomer = new Map<string, ProductEvent[]>();
  for (const event of events) {
    const customerEvents = byCustomer.get(event.customerId) ?? [];
    customerEvents.push(event);
    byCustomer.set(event.customerId, customerEvents);
  }
  for (const customerEvents of byCustomer.values()) {
    customerEvents.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  const counts = stages.map(() => 0);
  for (const customerEvents of byCustomer.values()) {
    let cursor = -1;
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
      const next = customerEvents.findIndex((event, eventIndex) => eventIndex > cursor && event.event === stages[stageIndex].event);
      if (next < 0) break;
      cursor = next;
      counts[stageIndex] += 1;
    }
  }

  return {
    stages: stages.map((stage, index) => ({
      event: stage.event,
      label: stage.label ?? stage.event.replaceAll("_", " "),
      count: counts[index],
      conversionFromPrevious: index === 0 ? (counts[index] > 0 ? 1 : 0) : counts[index - 1] === 0 ? 0 : counts[index] / counts[index - 1]
    })),
    uniqueCustomers: byCustomer.size,
    sourceMode,
    externalUrl
  };
}

export class MockPostHogAnalyticsAdapter extends BaseConnector implements ProductAnalyticsAdapter {
  readonly kind = "product-analytics" as const;
  readonly provider = "posthog" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["events", "funnels", "feature-exposure", "segments", "experiments"];
  protected readonly events: ProductEvent[] = [];

  constructor(runtime: AdapterRuntime = {}) {
    super("mock", runtime);
  }

  externalUrl(resource = ""): string {
    return `https://us.posthog.com/project/mock${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Mock PostHog project is ready.", this.externalUrl());
  }

  async capture(event: ProductEvent): Promise<ExternalReference> {
    const validated = productEventSchema.parse(event);
    this.events.push(validated);
    return {
      provider: "posthog",
      externalId: validated.id,
      url: this.externalUrl(`events/${encodeURIComponent(validated.id)}`),
      sourceMode: "mocked"
    };
  }

  async captureBatch(events: ProductEvent[]): Promise<ExternalReference[]> {
    return Promise.all(events.map((event) => this.capture(event)));
  }

  async queryFunnel(stages: FunnelStage[], from?: string, to?: string): Promise<FunnelResult> {
    return computeFunnel(this.events, stages, "mocked", from, to, this.externalUrl("insights"));
  }

  listEvents(): readonly ProductEvent[] {
    return this.events;
  }
}

export class LivePostHogAnalyticsAdapter extends BaseConnector implements ProductAnalyticsAdapter {
  readonly kind = "product-analytics" as const;
  readonly provider = "posthog" as const;
  protected readonly requiredEnvironment = ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"];
  protected readonly capabilities = ["events", "funnels", "feature-exposure", "segments", "experiments"];
  private readonly host: string;
  private readonly capturedEvents: ProductEvent[] = [];

  constructor(runtime: AdapterRuntime = {}) {
    super("live", runtime);
    this.host = (this.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/$/, "");
  }

  externalUrl(resource = ""): string {
    const uiHost = (this.env.POSTHOG_UI_HOST ?? this.host.replace(".i.posthog.com", ".posthog.com")).replace(/\/$/, "");
    const project = this.env.POSTHOG_PROJECT_ID ? `project/${this.env.POSTHOG_PROJECT_ID}` : "";
    return `${uiHost}${project ? `/${project}` : ""}${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      if (this.env.POSTHOG_PERSONAL_API_KEY && this.env.POSTHOG_PROJECT_ID) {
        await requestJson<unknown>(`${this.host}/api/projects/${encodeURIComponent(this.env.POSTHOG_PROJECT_ID)}/`, {
          provider: this.provider,
          fetcher: this.fetcher,
          timeoutMs: this.timeoutMs,
          headers: jsonHeaders({ authorization: `Bearer ${this.env.POSTHOG_PERSONAL_API_KEY}` })
        });
        return "PostHog project is readable with the personal API key.";
      }
      const query = new URLSearchParams({ v: "3", token: this.env.NEXT_PUBLIC_POSTHOG_KEY as string, distinct_id: "dailycart-health-check" });
      await requestJson<unknown>(`${this.host}/decide/?${query}`, {
        provider: this.provider,
        fetcher: this.fetcher,
        timeoutMs: this.timeoutMs,
        method: "GET",
        headers: { accept: "application/json" }
      });
      return "PostHog project key passed the read-only decide probe.";
    }, this.externalUrl());
  }

  async capture(event: ProductEvent): Promise<ExternalReference> {
    this.assertConfigured();
    const validated = productEventSchema.parse(event);
    await requestJson<unknown>(`${this.host}/i/v0/e/`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        api_key: this.env.NEXT_PUBLIC_POSTHOG_KEY,
        event: validated.event,
        distinct_id: validated.customerId,
        timestamp: validated.timestamp,
        uuid: validated.id,
        properties: { ...validated.properties, source_mode: validated.sourceMode }
      })
    });
    this.capturedEvents.push(validated);
    return {
      provider: "posthog",
      externalId: validated.id,
      url: this.externalUrl("events"),
      sourceMode: "live"
    };
  }

  async captureBatch(events: ProductEvent[]): Promise<ExternalReference[]> {
    this.assertConfigured();
    const validated = events.map((event) => productEventSchema.parse(event));
    await requestJson<unknown>(`${this.host}/batch/`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        api_key: this.env.NEXT_PUBLIC_POSTHOG_KEY,
        batch: validated.map((event) => ({
          event: event.event,
          distinct_id: event.customerId,
          timestamp: event.timestamp,
          uuid: event.id,
          properties: { ...event.properties, source_mode: event.sourceMode }
        }))
      })
    });
    this.capturedEvents.push(...validated);
    return validated.map((event) => ({
      provider: "posthog",
      externalId: event.id,
      url: this.externalUrl("events"),
      sourceMode: "live"
    }));
  }

  async queryFunnel(stages: FunnelStage[], from?: string, to?: string): Promise<FunnelResult> {
    return computeFunnel(this.capturedEvents, stages, "live", from, to, this.externalUrl("insights"));
  }
}

export function createProductAnalyticsAdapter(runtime: AdapterRuntime = {}): ProductAnalyticsAdapter {
  return (runtime.env ?? process.env).INTEGRATION_MODE === "live"
    ? new LivePostHogAnalyticsAdapter(runtime)
    : new MockPostHogAnalyticsAdapter(runtime);
}
