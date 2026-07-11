# Demo Product

Default candidate: Google Online Boutique  
Repository: https://github.com/GoogleCloudPlatform/microservices-demo

## Existing capabilities

- Catalogue and search
- Cart and checkout
- Mock payment, shipping, and email
- Recommendations
- Multiple services
- Locust load generation

## Additions required

- Product-event instrumentation
- Persistent synthetic customer IDs
- Scenario-driven traffic
- Product analytics adapter
- Feature and incident IDs
- Deployment metadata
- `SampleProductAdapter`

## Traffic controls

- User count
- Spawn rate
- Duration
- Behavior weights
- Device and geography
- New versus returning
- Feature exposure
- Failure scenarios
- Random seed

Google supplies code and a traffic generator, not a hosted customer business or historical research dataset.

## What is runnable in this repository

V1 includes a customer-facing DailyCart surface at `/product` so the end-to-end loop is visible without a separate cloud deployment. It has a real catalogue, search, cart, checkout, persistent synthetic customer ID, and product-event instrumentation. Events are sent to the product analytics adapter and persisted locally in `artifacts/product-events.jsonl`; the control tower reads those events on `/analytics`.

The control tower's **Generate traffic** action runs the bounded `SampleProductAdapter` against the deterministic local engine in mock mode, or calls `SAMPLE_PRODUCT_TRAFFIC_ENDPOINT` in live mode. The repository includes a live HTTP sidecar at `/api/dailycart/traffic`, so local live mode can exercise the same remote contract without credentials. This repository does not claim that the upstream Google services are already deployed: deploying that multi-service application remains an optional user-owned sidecar step.

The `/analytics` **Traffic controls** panel exposes the safe load-test inputs directly: user count, spawn rate, duration, scenario, random seed, and maximum events. Each run reports its source mode, effective users, event count, funnel completion, and whether a runtime/event cap shortened it. The cap is enforced by the adapter before traffic starts.
