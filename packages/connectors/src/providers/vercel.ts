import { deploymentSchema, type Deployment, type IntegrationHealth } from "@dailycart/schemas";
import { BaseConnector } from "../base";
import { ConnectorError } from "../errors";
import { jsonHeaders, requestJson } from "../http";
import type {
  AdapterRuntime,
  DeploymentAdapter,
  DeploymentInput,
  DeploymentRecord,
  TeardownRequest
} from "../types";

function deploymentStatus(readyState: string | undefined): Deployment["status"] {
  if (readyState === "READY") return "ready";
  if (readyState === "ERROR" || readyState === "CANCELED") return "failed";
  return "pending";
}

export class MockVercelDeploymentAdapter extends BaseConnector implements DeploymentAdapter {
  readonly kind = "deployment" as const;
  readonly provider = "deployment" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["preview", "production", "status", "teardown", "deep-links"];
  private readonly deployments = new Map<string, DeploymentRecord>();

  constructor(runtime: AdapterRuntime = {}) {
    super("mock", runtime);
  }

  externalUrl(resource = ""): string {
    return `https://vercel.com/dailycart/control-tower${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Mock deployment provider is ready.", this.externalUrl());
  }

  async deploy(input: DeploymentInput): Promise<DeploymentRecord> {
    const sequence = this.deployments.size + 1;
    const externalId = `mock-deployment-${sequence}`;
    const deployment = deploymentSchema.parse({
      id: input.id ?? `DEP-${String(9000 + sequence).padStart(4, "0")}`,
      featureId: input.featureId,
      environment: input.environment,
      status: "ready",
      commitSha: input.commitSha,
      url: `https://dailycart-${input.environment}-${sequence}.example.test`,
      deployedAt: this.now().toISOString(),
      sourceMode: "mocked"
    });
    const record: DeploymentRecord = {
      provider: "deployment",
      externalId,
      deployment,
      url: this.externalUrl(`deployments/${externalId}`),
      sourceMode: "mocked"
    };
    this.deployments.set(externalId, record);
    return record;
  }

  async getDeployment(externalId: string): Promise<DeploymentRecord | undefined> {
    return this.deployments.get(externalId);
  }

  async teardown(externalId: string, request: TeardownRequest): Promise<void> {
    if (request.confirmation !== "teardown-deployment") {
      throw new ConnectorError({ provider: this.provider, code: "INVALID_REQUEST", message: "Deployment teardown requires explicit confirmation." });
    }
    if (!this.deployments.delete(externalId)) {
      throw new ConnectorError({ provider: this.provider, code: "NOT_FOUND", message: `Deployment ${externalId} was not found.` });
    }
  }
}

interface VercelDeploymentResponse {
  id: string;
  url?: string;
  readyState?: string;
  createdAt?: number;
  meta?: Record<string, string>;
}

export class LiveVercelDeploymentAdapter extends BaseConnector implements DeploymentAdapter {
  readonly kind = "deployment" as const;
  readonly provider = "deployment" as const;
  protected readonly requiredEnvironment = ["VERCEL_TOKEN", "VERCEL_PROJECT_ID"];
  protected readonly capabilities = ["preview", "production", "status", "teardown", "deep-links"];
  private readonly apiBase: string;
  private readonly deploymentInputs = new Map<string, DeploymentInput>();

  constructor(runtime: AdapterRuntime = {}) {
    super("live", runtime);
    this.apiBase = (this.env.VERCEL_API_URL ?? "https://api.vercel.com").replace(/\/$/, "");
  }

  externalUrl(resource = ""): string {
    const org = this.env.VERCEL_ORG_SLUG ?? this.env.VERCEL_ORG_ID ?? "account";
    const project = this.env.VERCEL_PROJECT_SLUG ?? this.env.VERCEL_PROJECT_ID ?? "project";
    return `https://vercel.com/${org}/${project}${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  private query(): string {
    return this.env.VERCEL_ORG_ID ? `?teamId=${encodeURIComponent(this.env.VERCEL_ORG_ID)}` : "";
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();
    return requestJson<T>(`${this.apiBase}${path}${path.includes("?") ? "&" : this.query() ? "?" : ""}${this.query().replace(/^\?/, "")}`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      ...init,
      headers: jsonHeaders({ authorization: `Bearer ${this.env.VERCEL_TOKEN}`, ...(init.headers as Record<string, string> | undefined) })
    });
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      await this.request<unknown>(`/v9/projects/${encodeURIComponent(this.env.VERCEL_PROJECT_ID as string)}`);
      return "Vercel project is readable.";
    }, this.externalUrl());
  }

  private record(response: VercelDeploymentResponse, input: DeploymentInput): DeploymentRecord {
    const productUrl = response.url?.startsWith("http") ? response.url : `https://${response.url ?? `${response.id}.vercel.app`}`;
    const deployment = deploymentSchema.parse({
      id: input.id ?? `DEP-${String(Math.abs(hashCode(response.id)) % 1_000_000).padStart(4, "0")}`,
      featureId: input.featureId,
      environment: input.environment,
      status: deploymentStatus(response.readyState),
      commitSha: input.commitSha,
      url: productUrl,
      deployedAt: new Date(response.createdAt ?? this.now().getTime()).toISOString(),
      sourceMode: "live"
    });
    return {
      provider: "deployment",
      externalId: response.id,
      deployment,
      url: this.externalUrl(`deployments/${response.id}`),
      sourceMode: "live"
    };
  }

  async deploy(input: DeploymentInput): Promise<DeploymentRecord> {
    const response = await this.request<VercelDeploymentResponse>("/v13/deployments", {
      method: "POST",
      body: JSON.stringify({
        name: this.env.VERCEL_PROJECT_SLUG ?? this.env.VERCEL_PROJECT_ID,
        project: this.env.VERCEL_PROJECT_ID,
        target: input.environment === "production" ? "production" : undefined,
        gitSource: input.repository ? {
          type: "github",
          repoId: this.env.VERCEL_REPOSITORY_ID ? Number(this.env.VERCEL_REPOSITORY_ID) : undefined,
          ref: input.ref ?? input.commitSha,
          sha: input.commitSha
        } : undefined,
        meta: { featureId: input.featureId, commitSha: input.commitSha, environment: input.environment }
      })
    });
    this.deploymentInputs.set(response.id, input);
    return this.record(response, input);
  }

  async getDeployment(externalId: string): Promise<DeploymentRecord | undefined> {
    const input = this.deploymentInputs.get(externalId);
    if (!input) return undefined;
    try {
      const response = await this.request<VercelDeploymentResponse>(`/v13/deployments/${encodeURIComponent(externalId)}`);
      return this.record(response, input);
    } catch (error) {
      if (error instanceof ConnectorError && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
  }

  async teardown(externalId: string, request: TeardownRequest): Promise<void> {
    if (request.confirmation !== "teardown-deployment") {
      throw new ConnectorError({ provider: this.provider, code: "INVALID_REQUEST", message: "Deployment teardown requires explicit confirmation." });
    }
    await this.request<unknown>(`/v13/deployments/${encodeURIComponent(externalId)}`, { method: "DELETE" });
    this.deploymentInputs.delete(externalId);
  }
}

function hashCode(value: string): number {
  let hash = 0;
  for (const character of value) hash = Math.imul(31, hash) + character.charCodeAt(0) | 0;
  return hash;
}

export function createDeploymentAdapter(runtime: AdapterRuntime = {}): DeploymentAdapter {
  return (runtime.env ?? process.env).INTEGRATION_MODE === "live"
    ? new LiveVercelDeploymentAdapter(runtime)
    : new MockVercelDeploymentAdapter(runtime);
}
