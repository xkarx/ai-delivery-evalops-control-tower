# Sample product and deterministic traffic

## Demo mode

With `INTEGRATION_MODE=mock`, `MockSampleProductAdapter` runs a deterministic in-process engine. It needs no credentials or network. A fixed seed and clock reproduce the same customer sessions, events, funnel, failures, and feature exposures.

Traffic controls include user count, spawn rate, duration, seed, scenario, persistent customer-pool size, returning-customer rate, device/geography weights, behavior weights, exposure/failure rates, maximum runtime, maximum events, per-thousand-event cost, and maximum estimated cost. Caps are applied before generation. Every event is validated with `@dailycart/schemas` and forwarded to the configured analytics adapter.

Available scenarios are `baseline`, `feature-exposure`, `checkout-failure`, and `mixed`. Failure events carry `INC-0001`; exposure events carry `FEAT-0001`, preserving lineage in the default scenario.

## Live sidecar contract

Set `SAMPLE_PRODUCT_URL`. Optionally set:

- `SAMPLE_PRODUCT_TRAFFIC_ENDPOINT` (defaults to `{SAMPLE_PRODUCT_URL}/api/dailycart/traffic`)
- `SAMPLE_PRODUCT_TRAFFIC_TOKEN`
- `SAMPLE_PRODUCT_REPOSITORY`
- `SAMPLE_PRODUCT_ESTIMATED_HOURLY_COST_USD`

The traffic sidecar must implement:

- `POST /api/dailycart/traffic` with `TrafficConfig`, returning `TrafficRunResult`
- `POST /api/dailycart/traffic/stop`
- `POST /api/dailycart/traffic/teardown`

The adapter rejects remote results that exceed the requested cost or event cap and revalidates every returned product event. Health only reads `SAMPLE_PRODUCT_URL`.

Teardown requires `confirmation: "teardown-sample-product"` and a reason. This prevents a generic cleanup call from destroying the demo product accidentally. The default repository remains https://github.com/GoogleCloudPlatform/microservices-demo; the integration is adapter-based so the sidecar can target another product in V2.
