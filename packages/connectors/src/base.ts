import { integrationHealthSchema, type IntegrationHealth } from "@dailycart/schemas";
import { ConnectorError, normalizeConnectorError } from "./errors";
import type {
  AdapterRuntime,
  BaseAdapter,
  ConfigurationStatus,
  ConnectorMode,
  ConnectorProvider,
  Environment,
  FetchLike
} from "./types";

export function resolveIntegrationMode(env: Environment = process.env): ConnectorMode {
  return env.INTEGRATION_MODE === "live" ? "live" : "mock";
}

/**
 * Provider configuration is often provisioned before its optional deep-link
 * metadata. Never let an empty or malformed link turn a read-only health page
 * into a 500; omit the link and keep the provider's explicit status visible.
 */
function safeExternalUrl(value?: string): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

export abstract class BaseConnector implements BaseAdapter {
  abstract readonly kind: string;
  abstract readonly provider: ConnectorProvider;
  readonly mode: ConnectorMode;
  protected readonly env: Environment;
  protected readonly fetcher: FetchLike;
  protected readonly now: () => Date;
  protected readonly timeoutMs: number;
  protected abstract readonly requiredEnvironment: string[];
  protected abstract readonly capabilities: string[];

  protected constructor(mode: ConnectorMode, runtime: AdapterRuntime = {}) {
    this.mode = mode;
    this.env = runtime.env ?? process.env;
    this.fetcher = runtime.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = runtime.now ?? (() => new Date());
    this.timeoutMs = runtime.timeoutMs ?? 8_000;
  }

  configurationStatus(): ConfigurationStatus {
    if (this.mode === "mock") {
      return {
        provider: this.provider,
        mode: "mock",
        configured: true,
        writeEnabled: true,
        requiredEnvironment: [],
        missingEnvironment: [],
        message: "Mock adapter is ready; no credentials are required."
      };
    }
    const missingEnvironment = this.requiredEnvironment.filter((name) => !this.env[name]?.trim());
    const configured = missingEnvironment.length === 0;
    return {
      provider: this.provider,
      mode: "live",
      configured,
      writeEnabled: configured,
      requiredEnvironment: [...this.requiredEnvironment],
      missingEnvironment,
      message: configured
        ? "Live adapter is configured; run the read-only health check before enabling writes."
        : `Live adapter is missing: ${missingEnvironment.join(", ")}.`
    };
  }

  protected assertConfigured(): void {
    const status = this.configurationStatus();
    if (!status.configured) {
      throw new ConnectorError({
        provider: this.provider,
        code: "UNCONFIGURED",
        message: `${this.provider} is not configured (${status.missingEnvironment.join(", ")})`
      });
    }
  }

  protected healthy(message: string, externalUrl?: string): IntegrationHealth {
    return integrationHealthSchema.parse({
      provider: this.provider,
      mode: this.mode,
      status: "healthy",
      message,
      checkedAt: this.now().toISOString(),
      externalUrl: safeExternalUrl(externalUrl),
      capabilities: this.capabilities
    });
  }

  protected async safeHealth(probe: () => Promise<string>, externalUrl?: string): Promise<IntegrationHealth> {
    const configuration = this.configurationStatus();
    if (!configuration.configured) {
      return integrationHealthSchema.parse({
        provider: this.provider,
        mode: this.mode,
        status: "unconfigured",
        message: configuration.message,
        checkedAt: this.now().toISOString(),
        externalUrl: safeExternalUrl(externalUrl),
        capabilities: this.capabilities
      });
    }
    try {
      return this.healthy(await probe(), externalUrl);
    } catch (error) {
      const normalized = normalizeConnectorError(this.provider, error);
      return integrationHealthSchema.parse({
        provider: this.provider,
        mode: this.mode,
        status: normalized.retryable ? "degraded" : "error",
        message: `${normalized.code}: ${normalized.message}`,
        checkedAt: this.now().toISOString(),
        externalUrl: safeExternalUrl(externalUrl),
        capabilities: this.capabilities
      });
    }
  }

  abstract healthCheck(): Promise<IntegrationHealth>;
  abstract externalUrl(resource?: string): string | undefined;
}
