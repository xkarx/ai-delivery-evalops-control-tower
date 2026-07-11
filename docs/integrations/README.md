# Integration adapters

All providers implement the same operational contract:

- `configurationStatus()` reports mode, required variables, missing variables, and whether writes can be enabled.
- `healthCheck()` never throws. In live mode it performs a safe read-only provider probe and returns `healthy`, `degraded`, `unconfigured`, or `error`.
- Mutations throw a normalized `ConnectorError`; they never silently claim success.
- `externalUrl()` and mutation results link to the provider record.
- `INTEGRATION_MODE=mock` is credential-free and makes no network calls. `INTEGRATION_MODE=live` never falls back silently when configuration is incomplete.

Create the default set with `createConnectorSuite()`. Create the sample product separately with `createSampleProductAdapter({ analytics: suite.productAnalytics })` so generated events use the selected analytics provider.

Secrets belong in the deployment secret store. Do not place them in source files, prompts, logs, screenshots, or synthetic fixtures. Run the integration-health page after changing configuration and before enabling a write workflow.

Provider runbooks:

- [GitHub](./GITHUB.md)
- [Slack](./SLACK.md)
- [Linear and GitHub Issues fallback](./LINEAR.md)
- [Supabase](./SUPABASE.md)
- [Langfuse](./LANGFUSE.md)
- [PostHog](./POSTHOG.md)
- [Vercel deployments](./VERCEL.md)
- [Inngest workflows](./INNGEST.md)
- [Sample product and traffic sidecar](./SAMPLE_PRODUCT.md)
