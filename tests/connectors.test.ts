import { describe, expect, it, vi } from "vitest";
import { productEventSchema, type ProductEvent } from "../packages/schemas/src/index";
import {
  ConnectorError,
  LiveGitHubCodeHostAdapter,
  MockPostHogAnalyticsAdapter,
  createConnectorSuite,
  createIssueTrackerAdapter
} from "../packages/connectors/src/index";

const now = () => new Date("2026-07-10T16:00:00.000Z");

function event(id: string, customerId: string, name: ProductEvent["event"], seconds: number): ProductEvent {
  return productEventSchema.parse({
    id,
    event: name,
    customerId,
    timestamp: new Date(Date.parse("2026-07-10T16:00:00.000Z") + seconds * 1_000).toISOString(),
    properties: {},
    sourceMode: "simulated"
  });
}

describe("connector suite", () => {
  it("keeps every provider healthy in credential-free mock mode without touching fetch", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => { throw new Error("mock mode must not use the network"); });
    const suite = createConnectorSuite({ env: { INTEGRATION_MODE: "mock" }, fetch: fetcher, now });

    const adapters = Object.values(suite);
    const health = await Promise.all(adapters.map((adapter) => adapter.healthCheck()));

    expect(health.every((result) => result.status === "healthy" && result.mode === "mock")).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(adapters.every((adapter) => adapter.configurationStatus().writeEnabled)).toBe(true);
  });

  it("provides working mock code-host artifacts with external links", async () => {
    const { codeHost } = createConnectorSuite({ env: { INTEGRATION_MODE: "mock", GITHUB_DEFAULT_REPOSITORY: "dailycart/store" }, now });
    const issue = await codeHost.createIssue({ title: "Checkout timeout", description: "Track the regression." });
    const branch = await codeHost.createBranch({ name: "fix/checkout" });
    const pullRequest = await codeHost.openPullRequest({ title: "Fix checkout", body: "TKT-0001", head: branch.name });
    const checks = await codeHost.listChecks(branch.sha);
    const release = await codeHost.createRelease({ tag: "v1.0.0", name: "V1", notes: "Ready" });

    expect(issue.url).toBe("https://github.com/dailycart/store/issues/1");
    expect(pullRequest.url).toBe("https://github.com/dailycart/store/pull/1");
    expect(checks).toHaveLength(3);
    expect(checks.every((check) => check.conclusion === "success")).toBe(true);
    expect(release.url).toContain("releases/tag/v1.0.0");
  });

  it("stores and filters mock database records", async () => {
    const { database } = createConnectorSuite({ env: { INTEGRATION_MODE: "mock" }, now });
    await database.upsert("features", { id: "FEAT-0001", status: "candidate" });
    await database.upsert("features", { id: "FEAT-0001", status: "approved" });
    await database.upsert("features", { id: "FEAT-0002", status: "candidate" });

    await expect(database.select("features", { status: "approved" })).resolves.toEqual([
      { id: "FEAT-0001", status: "approved" }
    ]);
  });

  it("computes an ordered, unique-customer funnel from captured events", async () => {
    const analytics = new MockPostHogAnalyticsAdapter({ now });
    await analytics.captureBatch([
      event("evt-1", "CUS-0001", "session_started", 1),
      event("evt-2", "CUS-0001", "cart_added", 2),
      event("evt-3", "CUS-0001", "checkout_completed", 3),
      event("evt-4", "CUS-0002", "session_started", 1),
      event("evt-5", "CUS-0002", "checkout_completed", 2),
      event("evt-6", "CUS-0003", "cart_added", 1)
    ]);

    const funnel = await analytics.queryFunnel([
      { event: "session_started" },
      { event: "cart_added" },
      { event: "checkout_completed" }
    ]);

    expect(funnel.stages.map((stage) => stage.count)).toEqual([2, 1, 1]);
    expect(funnel.uniqueCustomers).toBe(3);
  });

  it("reports unconfigured live adapters without attempting a network call", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => { throw new Error("should not be called"); });
    const github = new LiveGitHubCodeHostAdapter({ env: { INTEGRATION_MODE: "live" }, fetch: fetcher, now });

    await expect(github.healthCheck()).resolves.toMatchObject({ status: "unconfigured", mode: "live" });
    await expect(github.createIssue({ title: "x", description: "missing credentials" }))
      .rejects.toMatchObject({ code: "UNCONFIGURED", provider: "github" } satisfies Partial<ConnectorError>);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses a read-only repository GET for configured GitHub health", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      full_name: "dailycart/store",
      default_branch: "main",
      private: true,
      html_url: "https://github.com/dailycart/store",
      open_issues_count: 2
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const github = new LiveGitHubCodeHostAdapter({
      env: { INTEGRATION_MODE: "live", GITHUB_TOKEN: "test-token", GITHUB_DEFAULT_REPOSITORY: "dailycart/store" },
      fetch: fetcher,
      now
    });

    await expect(github.healthCheck()).resolves.toMatchObject({ status: "healthy", mode: "live" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe("https://api.github.com/repos/dailycart/store");
    expect(fetcher.mock.calls[0][1]?.method ?? "GET").toBe("GET");
  });

  it("selects GitHub Issues as the live fallback when Linear is absent", () => {
    const tracker = createIssueTrackerAdapter({
      env: { INTEGRATION_MODE: "live", GITHUB_TOKEN: "test-token", GITHUB_DEFAULT_REPOSITORY: "dailycart/store" },
      now
    });
    expect(tracker.provider).toBe("github");
    expect(tracker.mode).toBe("live");
  });
});
