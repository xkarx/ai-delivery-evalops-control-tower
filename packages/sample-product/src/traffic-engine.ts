import { productEventSchema, type ProductEvent } from "@dailycart/schemas";
import { ConnectorError, type TrafficConfig, type TrafficRunResult } from "@dailycart/connectors";
import { createSeededRandom } from "./random";
import { trafficScenarios } from "./scenarios";

const MAX_EVENTS_PER_SESSION = 8;

function finiteInRange(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ConnectorError({
      provider: "sample-product",
      code: "INVALID_REQUEST",
      message: `${name} must be between ${minimum} and ${maximum}.`
    });
  }
}

function rate(name: string, value: number | undefined): void {
  if (value !== undefined) finiteInRange(name, value, 0, 1);
}

export function validateTrafficConfig(config: TrafficConfig): void {
  finiteInRange("userCount", config.userCount, 1, 100_000);
  finiteInRange("spawnRatePerSecond", config.spawnRatePerSecond, 0.01, 10_000);
  finiteInRange("durationSeconds", config.durationSeconds, 1, 86_400);
  finiteInRange("seed", config.seed, -2_147_483_648, 2_147_483_647);
  finiteInRange("customerPoolSize", config.customerPoolSize ?? 50, 1, 100_000);
  rate("returningCustomerRate", config.returningCustomerRate);
  rate("featureExposureRate", config.featureExposureRate);
  rate("failureRate", config.failureRate);
  for (const [name, value] of Object.entries(config.behaviorWeights ?? {})) rate(`behaviorWeights.${name}`, value);
  finiteInRange("costControls.maxEstimatedUsd", config.costControls.maxEstimatedUsd, 0, 100_000);
  finiteInRange("costControls.maxRuntimeSeconds", config.costControls.maxRuntimeSeconds, 1, 86_400);
  finiteInRange("costControls.costPerThousandEventsUsd", config.costControls.costPerThousandEventsUsd, 0, 100_000);
  finiteInRange("costControls.maxEvents", config.costControls.maxEvents, 0, 10_000_000);
}

export interface TrafficCapResult {
  effectiveUserCount: number;
  effectiveDurationSeconds: number;
  capped: boolean;
  stopReason: TrafficRunResult["stopReason"];
}

export function applyTrafficCaps(config: TrafficConfig): TrafficCapResult {
  validateTrafficConfig(config);
  const effectiveDurationSeconds = Math.min(config.durationSeconds, config.costControls.maxRuntimeSeconds);
  const spawnCapacity = Math.floor(effectiveDurationSeconds * config.spawnRatePerSecond);
  const eventCapacity = Math.floor(config.costControls.maxEvents / MAX_EVENTS_PER_SESSION);
  const costPerSession = MAX_EVENTS_PER_SESSION / 1_000 * config.costControls.costPerThousandEventsUsd;
  const costCapacity = costPerSession === 0
    ? Number.POSITIVE_INFINITY
    : Math.floor(config.costControls.maxEstimatedUsd / costPerSession);
  const effectiveUserCount = Math.max(0, Math.min(config.userCount, spawnCapacity, eventCapacity, costCapacity));
  let stopReason: TrafficRunResult["stopReason"] = "completed";
  if (effectiveDurationSeconds < config.durationSeconds || spawnCapacity < config.userCount) stopReason = "runtime_cap";
  if (eventCapacity < Math.min(config.userCount, spawnCapacity)) stopReason = "event_cap";
  if (costCapacity < Math.min(config.userCount, spawnCapacity, eventCapacity)) stopReason = "cost_cap";
  return {
    effectiveUserCount,
    effectiveDurationSeconds,
    capped: effectiveUserCount < config.userCount || effectiveDurationSeconds < config.durationSeconds,
    stopReason
  };
}

export function createPersistentCustomerIds(size: number): string[] {
  return Array.from({ length: size }, (_, index) => `CUS-${String(index + 1).padStart(4, "0")}`);
}

export interface TrafficEngineOptions {
  now?: () => Date;
  runSequence?: number;
  sourceMode?: TrafficRunResult["sourceMode"];
  customerIds?: string[];
}

export function generateTraffic(config: TrafficConfig, options: TrafficEngineOptions = {}): TrafficRunResult {
  const caps = applyTrafficCaps(config);
  const now = options.now ?? (() => new Date("2026-07-10T16:00:00.000Z"));
  const startedAtDate = now();
  const runSequence = options.runSequence ?? 1;
  const runId = `TRAFFIC-${String(Math.abs(config.seed)).padStart(6, "0")}-${String(runSequence).padStart(4, "0")}`;
  const random = createSeededRandom(config.seed + Math.imul(runSequence - 1, 10_007));
  const customerIds = options.customerIds ?? createPersistentCustomerIds(config.customerPoolSize ?? 50);
  if (customerIds.length === 0) {
    throw new ConnectorError({ provider: "sample-product", code: "INVALID_REQUEST", message: "At least one persistent customer ID is required." });
  }
  const profile = trafficScenarios[config.scenario];
  const searchRate = config.behaviorWeights?.search ?? profile.searchRate;
  const cartRate = config.behaviorWeights?.cart ?? profile.cartRate;
  const checkoutRate = config.behaviorWeights?.checkout ?? profile.checkoutRate;
  const exposureRate = config.featureExposureRate ?? profile.featureExposureRate;
  const failureRate = config.failureRate ?? profile.failureRate;
  const returningCustomerRate = config.returningCustomerRate ?? 0.42;
  const devices = { desktop: 0.46, mobile: 0.47, tablet: 0.07, ...config.devices };
  const geographies = { na: 0.46, emea: 0.25, apac: 0.2, latam: 0.09, ...config.geographies };
  const returningCohortSize = Math.max(1, Math.floor(customerIds.length * 0.25));
  const events: ProductEvent[] = [];
  let exposureCount = 0;
  let failureCount = 0;

  for (let userIndex = 0; userIndex < caps.effectiveUserCount; userIndex += 1) {
    const returning = random.chance(returningCustomerRate);
    const customerIndex = returning
      ? random.integer(0, returningCohortSize)
      : (returningCohortSize + userIndex) % customerIds.length;
    const customerId = customerIds[customerIndex];
    const sessionId = `${runId}-SESSION-${String(userIndex + 1).padStart(5, "0")}`;
    const sessionOffsetMs = Math.min(
      caps.effectiveDurationSeconds * 1_000,
      Math.floor(userIndex / config.spawnRatePerSecond * 1_000)
    );
    let step = 0;
    const common = {
      session_id: sessionId,
      scenario: config.scenario,
      device: random.pickWeighted(devices),
      geography: random.pickWeighted(geographies),
      returning_customer: returning
    };
    const emit = (event: ProductEvent["event"], properties: ProductEvent["properties"] = {}): void => {
      step += 1;
      const timestampMs = Math.min(
        startedAtDate.getTime() + caps.effectiveDurationSeconds * 1_000,
        startedAtDate.getTime() + sessionOffsetMs + step * 137
      );
      events.push(productEventSchema.parse({
        id: `${runId}-EVT-${String(events.length + 1).padStart(7, "0")}`,
        event,
        customerId,
        timestamp: new Date(timestampMs).toISOString(),
        properties: { ...common, ...properties },
        sourceMode: options.sourceMode ?? "simulated"
      }));
    };

    emit("session_started");
    emit("product_viewed", { product_id: `PROD-${String(random.integer(1, 21)).padStart(4, "0")}` });
    if (random.chance(searchRate)) emit("search_used", { query_family: random.pickWeighted({ apparel: 3, home: 2, gifts: 1 }) });
    if (random.chance(exposureRate)) {
      exposureCount += 1;
      emit("feature_exposed", { feature_id: "FEAT-0001", variant: random.chance(0.5) ? "treatment" : "control" });
    }
    if (!random.chance(cartRate)) continue;
    emit("cart_added", { cart_size: random.integer(1, 5) });
    if (!random.chance(checkoutRate)) continue;
    emit("checkout_started", { checkout_version: "v1" });
    if (random.chance(failureRate)) {
      failureCount += 1;
      emit("error_seen", { failure_code: "CHECKOUT_PAYMENT_TIMEOUT", incident_id: "INC-0001" });
    } else {
      emit("checkout_completed", { order_value_usd: random.integer(18, 240) });
    }
  }

  const funnelStages: ProductEvent["event"][] = ["session_started", "product_viewed", "cart_added", "checkout_started", "checkout_completed"];
  const funnel = funnelStages.map((stage) => ({ stage, count: events.filter((event) => event.event === stage).length }));
  const estimatedCostUsd = Number((events.length / 1_000 * config.costControls.costPerThousandEventsUsd).toFixed(6));
  const endedAtMs = events.length > 0
    ? new Date(events[events.length - 1].timestamp).getTime()
    : startedAtDate.getTime();

  return {
    runId,
    requestedConfig: structuredClone(config),
    effectiveUserCount: caps.effectiveUserCount,
    events,
    funnel,
    customerIds: [...new Set(events.map((event) => event.customerId))],
    exposureCount,
    failureCount,
    estimatedCostUsd,
    startedAt: startedAtDate.toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    capped: caps.capped,
    stopReason: caps.stopReason,
    sourceMode: options.sourceMode ?? "simulated"
  };
}
