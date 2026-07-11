# Langfuse connection

## Configuration

Set:

- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_HOST` for the selected cloud region or self-hosted instance
- optionally `LANGFUSE_PROJECT_ID` for project-specific deep links

The adapter uses HTTP Basic authentication only on server-side requests. Do not send the secret key to the browser.

## Verification and writes

Health reads `/api/public/projects?limit=1`. Trace ingestion sends a versioned `trace-create` batch to `/api/public/ingestion`. Eval results are attached as trace subjects through the current `/api/public/v3/scores` surface. Trace links retain the stable control-tower trace ID.

Before live verification, confirm the host's OpenAPI version supports the score request shape. Self-hosted Langfuse versions can lag cloud API versions; keep `INTEGRATION_MODE=mock` until the read probe passes.

References: https://langfuse.com/docs/api-and-data-platform/features/public-api and https://api.reference.langfuse.com
