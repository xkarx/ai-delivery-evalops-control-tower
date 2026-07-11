# PostHog connection

## Configuration

Set:

- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST` for the selected PostHog region
- optionally `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` for authenticated project reads and precise dashboard links
- optionally `POSTHOG_UI_HOST` when ingestion and UI hosts differ

The project key is used for event ingestion. Keep personal keys server-side.

## Verification and events

If a personal key and project ID exist, health reads the project API. Otherwise it calls the read-only `/decide` endpoint with a fixed health-check distinct ID. It never captures a health event.

Product events are validated with `productEventSchema`, preserve `CUS-*` as `distinct_id`, and include source-mode labels. Batch capture uses `/batch/`. The mock and live adapters maintain an ordered local funnel for events captured in the current process; provider-wide historical funnel queries require the optional personal API configuration.

Reference: https://posthog.com/docs/product-analytics/capture-events
