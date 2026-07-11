# Inngest workflow connection

## Configuration

Set:

- `INNGEST_EVENT_KEY` to emit workflow events
- `INNGEST_API_KEY` for the read-only REST health probe and run inspection
- `INNGEST_SIGNING_KEY` in the worker that serves Inngest functions
- optionally `INNGEST_ENVIRONMENT`, `INNGEST_API_BASE_URL`, and `INNGEST_EVENT_API_BASE_URL`

`INNGEST_API_KEY` is intentionally separate from event and signing keys. Add it to the deployment secret store even if an older `.env.example` lists only the other two.

## Verification and events

Health calls `GET /v2/apps?limit=1`. Event emission uses the Event API and preserves an optional caller-supplied idempotency ID. Run inspection and cancellation use the REST API. The mock adapter retains deterministic event/run records and supports cancellation without any credentials.

References: https://www.inngest.com/docs/events and https://www.inngest.com/docs/platform/api-keys
