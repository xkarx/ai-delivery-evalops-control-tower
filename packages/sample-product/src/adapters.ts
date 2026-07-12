import { productEventSchema, type IntegrationHealth } from "@dailycart/schemas";
import {
  BaseConnector,
  ConnectorError,
  createProductAnalyticsAdapter,
  jsonHeaders,
  requestJson,
  type AdapterRuntime,
  type ProductAnalyticsAdapter,
  type SampleProductAdapter,
  type SampleProductStatus,
  type TeardownRequest,
  type TrafficConfig,
  type TrafficRunResult
} from "@dailycart/connectors";
import { createPersistentCustomerIds, generateTraffic, validateTrafficConfig } from "./traffic-engine";

export interface SampleProductAdapterOptions extends AdapterRuntime {
  analytics?: ProductAnalyticsAdapter;
}

export class MockSampleProductAdapter extends BaseConnector implements SampleProductAdapter {
  readonly kind = "sample-product" as const;
  readonly provider = "sample-product" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["status", "traffic", "persistent-customers", "events", "cost-caps", "teardown"];
  private readonly analytics: ProductAnalyticsAdapter;
  private readonly productUrl: string;
  private readonly repositoryUrl: string;
  private readonly customerIds: string[];
  private running = false;
  private lastRun?: TrafficRunResult;
  private runSequence = 0;

  constructor(options: SampleProductAdapterOptions = {}) {
    super("mock", options);
    this.analytics = options.analytics ?? createProductAnalyticsAdapter({ ...options, env: { ...options.env, INTEGRATION_MODE: "mock" } });
    this.productUrl = this.env.SAMPLE_PRODUCT_URL || "http://localhost:8080";
    this.repositoryUrl = `https://github.com/${this.env.SAMPLE_PRODUCT_REPOSITORY ?? "GoogleCloudPlatform/microservices-demo"}`;
    this.customerIds = createPersistentCustomerIds(Number(this.env.SAMPLE_PRODUCT_CUSTOMER_POOL_SIZE ?? 50));
  }

  externalUrl(): string {
    return this.productUrl;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Simulated sample product and traffic engine are ready.", this.productUrl);
  }

  async status(): Promise<SampleProductStatus> {
    return {
      running: this.running,
      activeTrafficRunId: this.running ? this.lastRun?.runId : undefined,
      productUrl: this.productUrl,
      repositoryUrl: this.repositoryUrl,
      lastRun: this.lastRun ? structuredClone(this.lastRun) : undefined,
      estimatedHourlyCostUsd: 0,
      sourceMode: "simulated"
    };
  }

  async startTraffic(config: TrafficConfig): Promise<TrafficRunResult> {
    if (this.running) {
      throw new ConnectorError({ provider: this.provider, code: "INVALID_REQUEST", message: "A traffic run is already active." });
    }
    this.running = true;
    this.runSequence += 1;
    try {
      const result = generateTraffic(config, {
        now: this.now,
        runSequence: this.runSequence,
        sourceMode: "simulated",
        customerIds: this.customerIds
      });
      this.lastRun = result;
      await this.analytics.captureBatch(result.events);
      return structuredClone(result);
    } finally {
      this.running = false;
    }
  }

  async stopTraffic(): Promise<TrafficRunResult | undefined> {
    if (!this.running || !this.lastRun) return undefined;
    this.running = false;
    this.lastRun = { ...this.lastRun, endedAt: this.now().toISOString(), stopReason: "stopped" };
    return structuredClone(this.lastRun);
  }

  async teardown(request: TeardownRequest): Promise<void> {
    if (request.confirmation !== "teardown-sample-product") {
      throw new ConnectorError({ provider: this.provider, code: "INVALID_REQUEST", message: "Sample-product teardown requires explicit confirmation." });
    }
    this.running = false;
    this.lastRun = undefined;
  }
}

function normalizeRemoteResult(value: unknown, requestedConfig: TrafficConfig): TrafficRunResult {
  if (!value || typeof value !== "object") {
    throw new ConnectorError({ provider: "sample-product", code: "PROVIDER_ERROR", message: "Traffic endpoint returned a non-object response." });
  }
  const record = value as Partial<TrafficRunResult>;
  if (!record.runId || !Array.isArray(record.events) || !Array.isArray(record.funnel)) {
    throw new ConnectorError({ provider: "sample-product", code: "PROVIDER_ERROR", message: "Traffic endpoint response is missing runId, events, or funnel." });
  }
  const events = record.events.map((event) => productEventSchema.parse({ ...event, sourceMode: "live" }));
  const estimatedCostUsd = Number(record.estimatedCostUsd ?? 0);
  if (estimatedCostUsd > requestedConfig.costControls.maxEstimatedUsd + Number.EPSILON) {
    throw new ConnectorError({ provider: "sample-product", code: "PROVIDER_ERROR", message: "Traffic endpoint exceeded the configured cost cap." });
  }
  if (events.length > requestedConfig.costControls.maxEvents) {
    throw new ConnectorError({ provider: "sample-product", code: "PROVIDER_ERROR", message: "Traffic endpoint exceeded the configured event cap." });
  }
  return {
    runId: record.runId,
    requestedConfig: structuredClone(requestedConfig),
    effectiveUserCount: Number(record.effectiveUserCount ?? 0),
    events,
    funnel: record.funnel,
    customerIds: record.customerIds ?? [...new Set(events.map((event) => event.customerId))],
    exposureCount: Number(record.exposureCount ?? events.filter((event) => event.event === "feature_exposed").length),
    failureCount: Number(record.failureCount ?? events.filter((event) => event.event === "error_seen").length),
    estimatedCostUsd,
    startedAt: record.startedAt ?? events[0]?.timestamp ?? new Date(0).toISOString(),
    endedAt: record.endedAt ?? events.at(-1)?.timestamp ?? new Date(0).toISOString(),
    capped: Boolean(record.capped),
    stopReason: record.stopReason ?? "completed",
    sourceMode: "live"
  };
}

export class LiveSampleProductAdapter extends BaseConnector implements SampleProductAdapter {
  readonly kind = "sample-product" as const;
  readonly provider = "sample-product" as const;
  protected readonly requiredEnvironment = ["SAMPLE_PRODUCT_URL"];
  protected readonly capabilities = ["status", "traffic", "persistent-customers", "events", "cost-caps", "teardown"];
  private readonly analytics: ProductAnalyticsAdapter;
  private readonly productUrl: string;
  private readonly trafficEndpoint: string;
  private running = false;
  private lastRun?: TrafficRunResult;

  constructor(options: SampleProductAdapterOptions = {}) {
    super("live", options);
    this.analytics = options.analytics ?? createProductAnalyticsAdapter(options);
    this.productUrl = (this.env.SAMPLE_PRODUCT_URL || "").replace(/\/$/, "");
    this.trafficEndpoint = (this.env.SAMPLE_PRODUCT_TRAFFIC_ENDPOINT ?? `${this.productUrl}/api/dailycart/traffic`).replace(/\/$/, "");
  }

  externalUrl(): string | undefined {
    return this.productUrl || undefined;
  }

  private headers(): Record<string, string> {
    return jsonHeaders(this.env.SAMPLE_PRODUCT_TRAFFIC_TOKEN
      ? { authorization: `Bearer ${this.env.SAMPLE_PRODUCT_TRAFFIC_TOKEN}` }
      : {});
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      await requestJson<unknown>(this.productUrl, {
        provider: this.provider,
        fetcher: this.fetcher,
        timeoutMs: this.timeoutMs,
        method: "GET",
        headers: { accept: "text/html,application/json" }
      });
      return "Sample-product URL is reachable.";
    }, this.externalUrl());
  }

  async status(): Promise<SampleProductStatus> {
    return {
      running: this.running,
      activeTrafficRunId: this.running ? this.lastRun?.runId : undefined,
      productUrl: this.productUrl,
      repositoryUrl: `https://github.com/${this.env.SAMPLE_PRODUCT_REPOSITORY ?? "GoogleCloudPlatform/microservices-demo"}`,
      lastRun: this.lastRun ? structuredClone(this.lastRun) : undefined,
      estimatedHourlyCostUsd: Number(this.env.SAMPLE_PRODUCT_ESTIMATED_HOURLY_COST_USD ?? 0),
      sourceMode: "live"
    };
  }

  async startTraffic(config: TrafficConfig): Promise<TrafficRunResult> {
    this.assertConfigured();
    validateTrafficConfig(config);
    if (this.running) {
      throw new ConnectorError({ provider: this.provider, code: "INVALID_REQUEST", message: "A traffic run is already active." });
    }
    this.running = true;
    try {
      const response = await requestJson<unknown>(this.trafficEndpoint, {
        provider: this.provider,
        fetcher: this.fetcher,
        timeoutMs: Math.max(this.timeoutMs, Math.min(config.costControls.maxRuntimeSeconds * 1_000 + 5_000, 120_000)),
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(config)
      });
      const result = normalizeRemoteResult(response, config);
      this.lastRun = result;
      await this.analytics.captureBatch(result.events);
      return structuredClone(result);
    } finally {
      this.running = false;
    }
  }

  async stopTraffic(): Promise<TrafficRunResult | undefined> {
    if (!this.running) return undefined;
    await requestJson<unknown>(`${this.trafficEndpoint}/stop`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: this.headers(),
      body: "{}"
    });
    this.running = false;
    if (this.lastRun) this.lastRun = { ...this.lastRun, stopReason: "stopped", endedAt: this.now().toISOString() };
    return this.lastRun ? structuredClone(this.lastRun) : undefined;
  }

  async teardown(request: TeardownRequest): Promise<void> {
    this.assertConfigured();
    if (request.confirmation !== "teardown-sample-product") {
      throw new ConnectorError({ provider: this.provider, code: "INVALID_REQUEST", message: "Sample-product teardown requires explicit confirmation." });
    }
    await requestJson<unknown>(`${this.trafficEndpoint}/teardown`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ confirmation: request.confirmation, reason: request.reason })
    });
    this.running = false;
    this.lastRun = undefined;
  }
}

export function createSampleProductAdapter(options: SampleProductAdapterOptions = {}): SampleProductAdapter {
  return (options.env ?? process.env).INTEGRATION_MODE === "live"
    ? new LiveSampleProductAdapter(options)
    : new MockSampleProductAdapter(options);
}
