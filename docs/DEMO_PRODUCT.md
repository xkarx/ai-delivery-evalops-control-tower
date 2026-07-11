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

The control tower's **Generate traffic** action runs the bounded `SampleProductAdapter` against the deterministic local engine in mock mode, or calls `SAMPLE_PRODUCT_TRAFFIC_ENDPOINT` in live mode. This repository does not claim that the upstream Google services are already deployed: deploying that multi-service application is a user-owned sidecar step.
