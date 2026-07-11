import { describe, expect, it, vi } from "vitest";
import { MockPostHogAnalyticsAdapter } from "../packages/connectors/src/index";
import {
  MockSampleProductAdapter,
  createSampleProductAdapter,
  generateTraffic,
  type SampleProductAdapterOptions
} from "../packages/sample-product/src/index";
import type { TrafficConfig } from "../packages/connectors/src/index";

const fixedNow = () => new Date("2026-07-10T16:00:00.000Z");

function config(overrides: Partial<TrafficConfig> = {}): TrafficConfig {
  return {
    userCount: 40,
    spawnRatePerSecond: 10,
    durationSeconds: 30,
    seed: 20260710,
    scenario: "baseline",
    customerPoolSize: 50,
    returningCustomerRate: 0.45,
    costControls: {
      maxEstimatedUsd: 1,
      maxRuntimeSeconds: 60,
      costPerThousandEventsUsd: 0.2,
      maxEvents: 10_000
    },
    ...overrides
  };
}

describe("deterministic sample-product traffic", () => {
  it("reproduces identical events for the same seed and clock", () => {
    const first = generateTraffic(config(), { now: fixedNow });
    const second = generateTraffic(config(), { now: fixedNow });

    expect(second).toEqual(first);
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.events.every((event) => /^CUS-\d{4}$/.test(event.customerId))).toBe(true);
    expect(new Set(first.events.map((event) => event.customerId)).size).toBeLessThanOrEqual(50);
  });

  it("generates guaranteed feature exposure and checkout failures when configured", () => {
    const result = generateTraffic(config({
      scenario: "mixed",
      featureExposureRate: 1,
      failureRate: 1,
      behaviorWeights: { search: 1, cart: 1, checkout: 1 }
    }), { now: fixedNow });

    expect(result.exposureCount).toBe(result.effectiveUserCount);
    expect(result.failureCount).toBe(result.effectiveUserCount);
    expect(result.events.some((event) => event.event === "feature_exposed" && event.properties.feature_id === "FEAT-0001")).toBe(true);
    expect(result.events.some((event) => event.event === "error_seen" && event.properties.incident_id === "INC-0001")).toBe(true);
    expect(result.events.some((event) => event.event === "checkout_completed")).toBe(false);
  });

  it("keeps the generated funnel monotonic", () => {
    const result = generateTraffic(config(), { now: fixedNow });
    const counts = result.funnel.map((stage) => stage.count);

    expect(counts[0]).toBe(result.effectiveUserCount);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]);
    }
  });

  it("caps runs by event and cost budgets before generating traffic", () => {
    const eventCapped = generateTraffic(config({
      userCount: 100,
      costControls: { maxEstimatedUsd: 10, maxRuntimeSeconds: 60, costPerThousandEventsUsd: 0.1, maxEvents: 16 }
    }), { now: fixedNow });
    const costCapped = generateTraffic(config({
      userCount: 100,
      costControls: { maxEstimatedUsd: 0.08, maxRuntimeSeconds: 60, costPerThousandEventsUsd: 10, maxEvents: 10_000 }
    }), { now: fixedNow });

    expect(eventCapped.effectiveUserCount).toBe(2);
    expect(eventCapped.events.length).toBeLessThanOrEqual(16);
    expect(eventCapped.stopReason).toBe("event_cap");
    expect(costCapped.effectiveUserCount).toBe(1);
    expect(costCapped.estimatedCostUsd).toBeLessThanOrEqual(0.08);
    expect(costCapped.stopReason).toBe("cost_cap");
  });

  it("publishes every simulated event through the analytics adapter", async () => {
    const analytics = new MockPostHogAnalyticsAdapter({ now: fixedNow });
    const product = new MockSampleProductAdapter({ env: { INTEGRATION_MODE: "mock" }, now: fixedNow, analytics });

    const result = await product.startTraffic(config({ userCount: 12 }));
    const funnel = await analytics.queryFunnel([{ event: "session_started" }, { event: "cart_added" }, { event: "checkout_completed" }]);

    expect(analytics.listEvents()).toHaveLength(result.events.length);
    expect(funnel.stages[0].count).toBeGreaterThan(0);
    await expect(product.status()).resolves.toMatchObject({ running: false, lastRun: { runId: result.runId } });
  });

  it("requires explicit teardown confirmation and clears run state", async () => {
    const product = new MockSampleProductAdapter({ env: { INTEGRATION_MODE: "mock" }, now: fixedNow });
    await product.startTraffic(config({ userCount: 3 }));

    await expect(product.teardown({ confirmation: "teardown-deployment", reason: "wrong scope" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await product.teardown({ confirmation: "teardown-sample-product", reason: "demo complete" });
    await expect(product.status()).resolves.toMatchObject({ running: false, lastRun: undefined });
  });

  it("does not touch the network in mock mode and reports missing live configuration safely", async () => {
    const fetcher = vi.fn(async () => { throw new Error("network disabled in tests"); });
    const mockOptions: SampleProductAdapterOptions = { env: { INTEGRATION_MODE: "mock" }, fetch: fetcher, now: fixedNow };
    const mock = createSampleProductAdapter(mockOptions);
    await mock.startTraffic(config({ userCount: 2 }));
    expect(fetcher).not.toHaveBeenCalled();

    const live = createSampleProductAdapter({ env: { INTEGRATION_MODE: "live" }, fetch: fetcher, now: fixedNow });
    await expect(live.healthCheck()).resolves.toMatchObject({ status: "unconfigured", mode: "live" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
