# Manual Connection Checklist

Expected user-owned actions for connected mode:

1. Create or choose the GitHub repository and install the GitHub App with the least-privilege permissions in `docs/integrations/GITHUB.md`.
2. Create/authorize the Slack app with the `chat:write` bot scope, invite it to the target channel, and configure `SLACK_DEFAULT_CHANNEL` as the channel ID. For the four-channel demo, also set the delivery, approvals, alerts, and analytics channel IDs; they may point to one channel while you are testing.
3. Choose Linear and team, or confirm GitHub Issues fallback, then set the tracker variables.
4. Create Supabase, Langfuse, PostHog, and deployment projects; apply the Supabase migration.
5. Add secrets only through the deployment/provider secret store and set `INTEGRATION_MODE=live`. Set a strong, private `DAILYCART_OPERATOR_PASSCODE`; this is required for live writes, OpenAI calls, replay, reset, and deployments.
6. Run the integration health page and keep writes disabled until every required read-only health check is healthy.
7. Open `/product` to exercise the local DailyCart product now. If you want the Google Online Boutique sidecar, deploy `GoogleCloudPlatform/microservices-demo`, expose its traffic endpoint, then set `SAMPLE_PRODUCT_URL` and (if different) `SAMPLE_PRODUCT_TRAFFIC_ENDPOINT`.
8. Approve production-impacting Slack, GitHub, ticket, and deployment actions. Verify the Integrations page shows the provider's last action and external link after each write.

The live deployment can still be browsed when a provider is unavailable. The UI must show `UNAUTHORIZED`, `PERMISSION REQUIRED`, `SERVICE ERROR`, or `DETERMINISTIC FALLBACK` for the affected action; never treat a fallback record as a real external write.

Never place secret values in this file.
