import { randomUUID } from "node:crypto";
import type { IntegrationHealth } from "@dailycart/schemas";
import { BaseConnector } from "../base";
import { jsonHeaders, requestJson } from "../http";
import type {
  AdapterRuntime,
  ExternalReference,
  TraceAdapter,
  TraceInput,
  TraceRecord,
  TraceScoreInput
} from "../types";

export class MockLangfuseTraceAdapter extends BaseConnector implements TraceAdapter {
  readonly kind = "trace" as const;
  readonly provider = "langfuse" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["traces", "observations", "scores", "datasets", "cost", "latency"];
  private readonly traces = new Map<string, TraceRecord>();
  private scoreSequence = 0;

  constructor(runtime: AdapterRuntime = {}) {
    super("mock", runtime);
  }

  externalUrl(resource = ""): string {
    return `https://cloud.langfuse.com/project/mock${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Mock Langfuse project is ready.", this.externalUrl());
  }

  async startTrace(input: TraceInput): Promise<TraceRecord> {
    const externalId = input.id ?? `mock-trace-${String(this.traces.size + 1).padStart(4, "0")}`;
    const record: TraceRecord = {
      provider: "langfuse",
      externalId,
      name: input.name,
      startedAt: this.now().toISOString(),
      metadata: input.metadata ?? {},
      url: this.externalUrl(`traces/${externalId}`),
      sourceMode: "mocked"
    };
    this.traces.set(externalId, record);
    return record;
  }

  async addScore(input: TraceScoreInput): Promise<ExternalReference> {
    this.scoreSequence += 1;
    return {
      provider: "langfuse",
      externalId: `mock-score-${this.scoreSequence}`,
      url: this.externalUrl(`traces/${input.traceId}`),
      sourceMode: "mocked"
    };
  }

  async getTrace(traceId: string): Promise<TraceRecord | undefined> {
    return this.traces.get(traceId);
  }
}

export class LiveLangfuseTraceAdapter extends BaseConnector implements TraceAdapter {
  readonly kind = "trace" as const;
  readonly provider = "langfuse" as const;
  protected readonly requiredEnvironment = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_HOST"];
  protected readonly capabilities = ["traces", "observations", "scores", "datasets", "cost", "latency"];
  private readonly host: string;

  constructor(runtime: AdapterRuntime = {}) {
    super("live", runtime);
    this.host = (this.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com").replace(/\/$/, "");
  }

  externalUrl(resource = ""): string {
    const project = this.env.LANGFUSE_PROJECT_ID ? `project/${this.env.LANGFUSE_PROJECT_ID}` : "";
    return `${this.host}${project ? `/${project}` : ""}${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  private authorization(): string {
    return `Basic ${Buffer.from(`${this.env.LANGFUSE_PUBLIC_KEY}:${this.env.LANGFUSE_SECRET_KEY}`).toString("base64")}`;
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();
    return requestJson<T>(`${this.host}${path}`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      ...init,
      headers: jsonHeaders({ authorization: this.authorization(), ...(init.headers as Record<string, string> | undefined) })
    });
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      await this.request<unknown>("/api/public/projects?limit=1");
      return "Langfuse project credentials can read the public API.";
    }, this.externalUrl());
  }

  async startTrace(input: TraceInput): Promise<TraceRecord> {
    const externalId = input.id ?? randomUUID();
    const timestamp = this.now().toISOString();
    await this.request<unknown>("/api/public/ingestion", {
      method: "POST",
      body: JSON.stringify({
        batch: [{
          id: randomUUID(),
          timestamp,
          type: "trace-create",
          body: {
            id: externalId,
            timestamp,
            name: input.name,
            userId: input.userId,
            sessionId: input.sessionId,
            input: input.input,
            output: input.output,
            metadata: input.metadata,
            tags: input.tags
          }
        }]
      })
    });
    return {
      provider: "langfuse",
      externalId,
      name: input.name,
      startedAt: timestamp,
      metadata: input.metadata ?? {},
      url: this.externalUrl(`traces/${externalId}`),
      sourceMode: "live"
    };
  }

  async addScore(input: TraceScoreInput): Promise<ExternalReference> {
    const value = typeof input.value === "boolean" ? (input.value ? 1 : 0) : input.value;
    const dataType = typeof input.value === "boolean" ? "BOOLEAN" : typeof input.value === "number" ? "NUMERIC" : "TEXT";
    // Score creation remains on the public v1 endpoint. Langfuse's v3 scores
    // route is query-only (GET); using it for writes returns HTTP 405.
    const response = await this.request<{ id?: string }>("/api/public/scores", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        value,
        dataType,
        comment: input.comment,
        traceId: input.traceId
      })
    });
    return {
      provider: "langfuse",
      externalId: response.id ?? `${input.traceId}:${input.name}`,
      url: this.externalUrl(`traces/${input.traceId}`),
      sourceMode: "live"
    };
  }

  async getTrace(traceId: string): Promise<TraceRecord | undefined> {
    try {
      const response = await this.request<{ id: string; name?: string; timestamp?: string; metadata?: Record<string, unknown> }>(
        `/api/public/traces/${encodeURIComponent(traceId)}`
      );
      return {
        provider: "langfuse",
        externalId: response.id,
        name: response.name ?? "trace",
        startedAt: response.timestamp ?? this.now().toISOString(),
        metadata: response.metadata ?? {},
        url: this.externalUrl(`traces/${traceId}`),
        sourceMode: "live"
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
  }
}

export function createTraceAdapter(runtime: AdapterRuntime = {}): TraceAdapter {
  return (runtime.env ?? process.env).INTEGRATION_MODE === "live"
    ? new LiveLangfuseTraceAdapter(runtime)
    : new MockLangfuseTraceAdapter(runtime);
}
