export type ConnectorErrorCode =
  | "UNCONFIGURED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "TIMEOUT"
  | "NETWORK"
  | "PROVIDER_ERROR"
  | "UNSUPPORTED";

export interface ConnectorErrorOptions {
  provider: string;
  code: ConnectorErrorCode;
  message: string;
  retryable?: boolean;
  status?: number;
  cause?: unknown;
}

export class ConnectorError extends Error {
  readonly provider: string;
  readonly code: ConnectorErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(options: ConnectorErrorOptions) {
    super(options.message);
    this.name = "ConnectorError";
    this.provider = options.provider;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.cause = options.cause;
  }

  toJSON(): Omit<ConnectorErrorOptions, "cause"> {
    return {
      provider: this.provider,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.status === undefined ? {} : { status: this.status })
    };
  }
}

export function isConnectorError(error: unknown): error is ConnectorError {
  return error instanceof ConnectorError;
}

function codeForStatus(status: number): Pick<ConnectorErrorOptions, "code" | "retryable"> {
  if (status === 401) return { code: "UNAUTHORIZED", retryable: false };
  if (status === 403) return { code: "FORBIDDEN", retryable: false };
  if (status === 404) return { code: "NOT_FOUND", retryable: false };
  if (status === 408 || status === 504) return { code: "TIMEOUT", retryable: true };
  if (status === 429) return { code: "RATE_LIMITED", retryable: true };
  if (status >= 400 && status < 500) return { code: "INVALID_REQUEST", retryable: false };
  return { code: "PROVIDER_ERROR", retryable: status >= 500 };
}

export function connectorErrorFromStatus(provider: string, status: number, detail?: string): ConnectorError {
  const mapping = codeForStatus(status);
  return new ConnectorError({
    provider,
    status,
    ...mapping,
    message: `${provider} request failed with HTTP ${status}${detail ? `: ${detail}` : ""}`
  });
}

export function normalizeConnectorError(provider: string, error: unknown): ConnectorError {
  if (isConnectorError(error)) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ConnectorError({ provider, code: "TIMEOUT", message: `${provider} request timed out`, retryable: true, cause: error });
  }
  if (error instanceof TypeError) {
    return new ConnectorError({ provider, code: "NETWORK", message: `${provider} network request failed`, retryable: true, cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ConnectorError({ provider, code: "PROVIDER_ERROR", message: `${provider} operation failed: ${message}`, cause: error });
}
