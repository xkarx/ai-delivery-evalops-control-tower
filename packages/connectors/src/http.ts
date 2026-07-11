import { connectorErrorFromStatus, normalizeConnectorError } from "./errors";
import type { FetchLike } from "./types";

export interface JsonRequestOptions extends RequestInit {
  provider: string;
  fetcher: FetchLike;
  timeoutMs: number;
}

function responseDetail(value: unknown): string | undefined {
  if (typeof value === "string") return value.slice(0, 300);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = record.message ?? record.error ?? record.detail;
    if (typeof candidate === "string") return candidate.slice(0, 300);
  }
  return undefined;
}

export async function requestJson<T>(url: string, options: JsonRequestOptions): Promise<T> {
  const { provider, fetcher, timeoutMs, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    if (!response.ok) throw connectorErrorFromStatus(provider, response.status, responseDetail(body));
    return body as T;
  } catch (error) {
    throw normalizeConnectorError(provider, error);
  } finally {
    clearTimeout(timer);
  }
}

export function jsonHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { accept: "application/json", "content-type": "application/json", ...headers };
}
