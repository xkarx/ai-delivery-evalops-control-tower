import type { IntegrationHealth } from "@dailycart/schemas";
import { BaseConnector } from "../base";
import { ConnectorError } from "../errors";
import { jsonHeaders, requestJson } from "../http";
import type {
  AdapterRuntime,
  WorkflowAdapter,
  WorkflowEventInput,
  WorkflowRunRecord
} from "../types";

export class MockInngestWorkflowAdapter extends BaseConnector implements WorkflowAdapter {
  readonly kind = "workflow" as const;
  readonly provider = "workflow" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["events", "runs", "retries", "cancellation", "deep-links"];
  private readonly runs = new Map<string, WorkflowRunRecord>();

  constructor(runtime: AdapterRuntime = {}) {
    super("mock", runtime);
  }

  externalUrl(resource = ""): string {
    return `https://app.inngest.com/env/mock${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Mock workflow engine is ready.", this.externalUrl());
  }

  async emit(input: WorkflowEventInput): Promise<WorkflowRunRecord> {
    const externalId = input.id ?? `mock-event-${String(this.runs.size + 1).padStart(4, "0")}`;
    const record: WorkflowRunRecord = {
      provider: "workflow",
      externalId,
      eventName: input.name,
      status: "queued",
      url: this.externalUrl(`events/${externalId}`),
      sourceMode: "mocked"
    };
    this.runs.set(externalId, record);
    return record;
  }

  async getRun(externalId: string): Promise<WorkflowRunRecord | undefined> {
    return this.runs.get(externalId);
  }

  async cancel(externalId: string): Promise<WorkflowRunRecord> {
    const run = this.runs.get(externalId);
    if (!run) throw new ConnectorError({ provider: this.provider, code: "NOT_FOUND", message: `Workflow run ${externalId} was not found.` });
    const cancelled: WorkflowRunRecord = { ...run, status: "cancelled" };
    this.runs.set(externalId, cancelled);
    return cancelled;
  }
}

interface InngestRunResponse {
  id?: string;
  status?: string;
  event_name?: string;
  data?: { id?: string; status?: string; eventName?: string };
}

export class LiveInngestWorkflowAdapter extends BaseConnector implements WorkflowAdapter {
  readonly kind = "workflow" as const;
  readonly provider = "workflow" as const;
  protected readonly requiredEnvironment = ["INNGEST_EVENT_KEY", "INNGEST_API_KEY"];
  protected readonly capabilities = ["events", "runs", "retries", "cancellation", "deep-links"];
  private readonly apiBase: string;
  private readonly eventBase: string;
  private readonly runs = new Map<string, WorkflowRunRecord>();

  constructor(runtime: AdapterRuntime = {}) {
    super("live", runtime);
    this.apiBase = (this.env.INNGEST_API_BASE_URL || "https://api.inngest.com").replace(/\/$/, "");
    this.eventBase = (this.env.INNGEST_EVENT_API_BASE_URL || "https://inn.gs").replace(/\/$/, "");
  }

  externalUrl(resource = ""): string {
    const environment = this.env.INNGEST_ENVIRONMENT ?? "production";
    return `https://app.inngest.com/env/${environment}${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  private apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();
    return requestJson<T>(`${this.apiBase}${path}`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      ...init,
      headers: jsonHeaders({ authorization: `Bearer ${this.env.INNGEST_API_KEY}`, ...(init.headers as Record<string, string> | undefined) })
    });
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher("https://api.inngest.com/v2/account", {
          method: "GET",
          headers: {
            authorization: `Bearer ${this.env.INNGEST_API_KEY}`,
            accept: "application/json"
          },
          signal: controller.signal
        });
        if (response.status === 200) return "Inngest account is readable with the API key.";
        if (response.status === 401) {
          throw new ConnectorError({
            provider: this.provider,
            code: "UNAUTHORIZED",
            status: 401,
            message: "Inngest API key is invalid."
          });
        }
        if (response.status === 403) {
          throw new ConnectorError({
            provider: this.provider,
            code: "FORBIDDEN",
            status: 403,
            message: "Inngest API key lacks permission to read the account."
          });
        }
        throw new ConnectorError({
          provider: this.provider,
          code: "PROVIDER_ERROR",
          status: response.status,
          message: `Inngest account health check failed with HTTP ${response.status}.`
        });
      } finally {
        clearTimeout(timer);
      }
    }, "https://api.inngest.com/v2/account");
  }

  async emit(input: WorkflowEventInput): Promise<WorkflowRunRecord> {
    this.assertConfigured();
    const response = await requestJson<{ ids?: string[] }>(`${this.eventBase}/e/${encodeURIComponent(this.env.INNGEST_EVENT_KEY as string)}`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        id: input.id,
        name: input.name,
        data: input.data,
        user: input.user ? { external_id: input.user.externalId, email: input.user.email } : undefined,
        ts: this.now().getTime()
      })
    });
    const externalId = response.ids?.[0] ?? input.id;
    if (!externalId) {
      throw new ConnectorError({ provider: this.provider, code: "PROVIDER_ERROR", message: "Inngest accepted the event without returning an event ID." });
    }
    const record: WorkflowRunRecord = {
      provider: "workflow",
      externalId,
      eventName: input.name,
      status: "queued",
      url: this.externalUrl(`events/${externalId}`),
      sourceMode: "live"
    };
    this.runs.set(externalId, record);
    return record;
  }

  async getRun(externalId: string): Promise<WorkflowRunRecord | undefined> {
    try {
      const response = await this.apiRequest<InngestRunResponse>(`/v2/runs/${encodeURIComponent(externalId)}`);
      const data = response.data ?? { id: response.id, status: response.status, eventName: response.event_name };
      const status = normalizeRunStatus(data.status);
      const record: WorkflowRunRecord = {
        provider: "workflow",
        externalId: data.id ?? externalId,
        eventName: data.eventName ?? this.runs.get(externalId)?.eventName ?? "unknown",
        status,
        url: this.externalUrl(`runs/${data.id ?? externalId}`),
        sourceMode: "live"
      };
      this.runs.set(externalId, record);
      return record;
    } catch (error) {
      if (error instanceof ConnectorError && error.code === "NOT_FOUND") return this.runs.get(externalId);
      throw error;
    }
  }

  async cancel(externalId: string): Promise<WorkflowRunRecord> {
    await this.apiRequest<unknown>(`/v2/runs/${encodeURIComponent(externalId)}/cancel`, { method: "POST", body: "{}" });
    const current = this.runs.get(externalId);
    const record: WorkflowRunRecord = {
      provider: "workflow",
      externalId,
      eventName: current?.eventName ?? "unknown",
      status: "cancelled",
      url: this.externalUrl(`runs/${externalId}`),
      sourceMode: "live"
    };
    this.runs.set(externalId, record);
    return record;
  }
}

function normalizeRunStatus(status: string | undefined): WorkflowRunRecord["status"] {
  switch (status?.toLowerCase()) {
    case "running": return "running";
    case "completed": return "completed";
    case "failed": return "failed";
    case "cancelled": return "cancelled";
    default: return "queued";
  }
}

export function createWorkflowAdapter(runtime: AdapterRuntime = {}): WorkflowAdapter {
  return (runtime.env ?? process.env).INTEGRATION_MODE === "live"
    ? new LiveInngestWorkflowAdapter(runtime)
    : new MockInngestWorkflowAdapter(runtime);
}
