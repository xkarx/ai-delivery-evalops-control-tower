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
