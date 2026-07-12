import { lineageEdgeSchema, type IntegrationHealth, type LineageEdge } from "@dailycart/schemas";
import { BaseConnector } from "../base";
import { ConnectorError } from "../errors";
import { jsonHeaders, requestJson } from "../http";
import type { AdapterRuntime, DatabaseAdapter } from "../types";

function assertTableName(table: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(table)) {
    throw new ConnectorError({ provider: "supabase", code: "INVALID_REQUEST", message: `Unsafe table name: ${table}` });
  }
}

export class MockSupabaseDatabaseAdapter extends BaseConnector implements DatabaseAdapter {
  readonly kind = "database" as const;
  readonly provider = "supabase" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["records", "lineage", "external-references", "queries"];
  private readonly tables = new Map<string, Array<Record<string, unknown>>>();

  constructor(runtime: AdapterRuntime = {}) {
    super("mock", runtime);
  }

  externalUrl(resource = ""): string {
    return `https://supabase.com/dashboard/project/mock${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Mock Supabase database is ready.", this.externalUrl());
  }

  async upsert<T extends Record<string, unknown>>(table: string, row: T, conflictColumn = "id"): Promise<T> {
    assertTableName(table);
    const rows = this.tables.get(table) ?? [];
    const conflictValue = row[conflictColumn];
    const existingIndex = rows.findIndex((candidate) => candidate[conflictColumn] === conflictValue);
    if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...row };
    else rows.push({ ...row });
    this.tables.set(table, rows);
    return { ...(existingIndex >= 0 ? rows[existingIndex] : row) } as T;
  }

  async select<T extends Record<string, unknown>>(table: string, filters: Record<string, string | number | boolean> = {}): Promise<T[]> {
    assertTableName(table);
    return (this.tables.get(table) ?? [])
      .filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value))
      .map((row) => ({ ...row }) as T);
  }

  async appendLineage(edge: LineageEdge): Promise<LineageEdge> {
    return this.upsert("lineage_edges", lineageEdgeSchema.parse(edge));
  }
}

export class LiveSupabaseDatabaseAdapter extends BaseConnector implements DatabaseAdapter {
  readonly kind = "database" as const;
  readonly provider = "supabase" as const;
  protected readonly requiredEnvironment = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  protected readonly capabilities = ["records", "lineage", "external-references", "queries"];
  private readonly url: string;

  constructor(runtime: AdapterRuntime = {}) {
    super("live", runtime);
    this.url = (this.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  }

  externalUrl(resource = ""): string {
    const projectRef = this.env.SUPABASE_PROJECT_REF ?? this.url.match(/^https:\/\/([^.]+)\./)?.[1] ?? "";
    return `https://supabase.com/dashboard/project/${projectRef}${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return jsonHeaders({
      apikey: this.env.SUPABASE_SERVICE_ROLE_KEY as string,
      authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...extra
    });
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      await requestJson<unknown>(`${this.url}/rest/v1/`, {
        provider: this.provider,
        fetcher: this.fetcher,
        timeoutMs: this.timeoutMs,
        method: "GET",
        headers: this.headers()
      });
      return "Supabase REST schema is readable.";
    }, this.externalUrl("editor"));
  }

  async upsert<T extends Record<string, unknown>>(table: string, row: T, conflictColumn = "id"): Promise<T> {
    this.assertConfigured();
    assertTableName(table);
    const query = new URLSearchParams({ on_conflict: conflictColumn });
    const response = await requestJson<T[]>(`${this.url}/rest/v1/${table}?${query}`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: this.headers({ prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify(row)
    });
    return response[0] ?? row;
  }

  async select<T extends Record<string, unknown>>(table: string, filters: Record<string, string | number | boolean> = {}): Promise<T[]> {
    this.assertConfigured();
    assertTableName(table);
    const query = new URLSearchParams({ select: "*" });
    for (const [key, value] of Object.entries(filters)) {
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        throw new ConnectorError({ provider: this.provider, code: "INVALID_REQUEST", message: `Unsafe filter column: ${key}` });
      }
      query.set(key, `eq.${String(value)}`);
    }
    return requestJson<T[]>(`${this.url}/rest/v1/${table}?${query}`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "GET",
      headers: this.headers()
    });
  }

  async appendLineage(edge: LineageEdge): Promise<LineageEdge> {
    return this.upsert("lineage_edges", lineageEdgeSchema.parse(edge));
  }
}

export function createDatabaseAdapter(runtime: AdapterRuntime = {}): DatabaseAdapter {
  return (runtime.env ?? process.env).INTEGRATION_MODE === "live"
    ? new LiveSupabaseDatabaseAdapter(runtime)
    : new MockSupabaseDatabaseAdapter(runtime);
}
