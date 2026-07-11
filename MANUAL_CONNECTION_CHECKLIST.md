# Manual Connection Checklist

Expected user-owned actions (the only remaining V1 blockers):

1. Create or choose the GitHub repository and install the GitHub App with the least-privilege permissions in `docs/integrations/GITHUB.md`.
2. Create/authorize the Slack app, invite it to the target channel, and configure `SLACK_DEFAULT_CHANNEL` as the channel ID.
3. Choose Linear and team, or confirm GitHub Issues fallback, then set the tracker variables.
4. Create Supabase, Langfuse, PostHog, and deployment projects; apply the Supabase migration.
5. Add secrets only through the deployment/provider secret store and set `INTEGRATION_MODE=live`.
6. Run the integration health page and keep writes disabled until every required read-only health check is healthy.
7. Open `/product` to exercise the local DailyCart product now. If you want the Google Online Boutique sidecar, deploy `GoogleCloudPlatform/microservices-demo`, expose its traffic endpoint, then set `SAMPLE_PRODUCT_URL` and (if different) `SAMPLE_PRODUCT_TRAFFIC_ENDPOINT`.
8. Approve production-impacting Slack, GitHub, ticket, and deployment actions.

Never place secret values in this file.
