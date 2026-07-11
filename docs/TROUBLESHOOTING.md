# Troubleshooting

## `pnpm` is unavailable

Node 20+ ships Corepack. Run `corepack enable` once, then use `corepack pnpm`. The repository pins pnpm 11.7.0.

## Demo state is stale

Run `corepack pnpm demo:reset && corepack pnpm demo` and confirm `artifacts/demo-state.json` was recreated. The seed is controlled by `SYNTHETIC_DATA_SEED`.

## Connected mode reports unconfigured

This is intentional until the provider's read-only health variables are present. Keep `INTEGRATION_MODE=mock` for local demos; never paste credentials into this repository.

## The UI says mocked or simulated

That label is the source-of-truth for the current path. In `INTEGRATION_MODE=mock`, `/product`, **Generate traffic**, **Create delivery ticket**, and **Run demo** execute locally and persist evidence, but they do not contact Slack, Linear, GitHub, PostHog, or a deployed product. To enable external writes, add the provider values in the deployment/server secret store, set `INTEGRATION_MODE=live`, restart the server, and rerun `/integrations` health checks. A missing `SAMPLE_PRODUCT_URL` means the local DailyCart surface remains the active product target.

When live mode is active, the integration cards distinguish read-only health from write configuration. A provider can pass health and still reject a write (for example Slack `missing_scope`); the action result now reports the provider error and preserves any earlier successful ticket creation.

## Playwright cannot find a browser

Run `corepack pnpm exec playwright install chromium`, or let the CI workflow install browsers with `--with-deps`.

## Supabase writes fail

Apply `supabase/migrations/0001_control_tower.sql` first, verify RLS, then rerun the integration health page. The service-role key belongs only in the server/worker secret store.

## Slack health is green but messages fail with `missing_scope`

Slack `auth.test` proves the bot token is valid, but posting requires the bot OAuth scope `chat:write`. Add that scope in the Slack app, reinstall/re-authorize the app, invite the bot to `SLACK_DEFAULT_CHANNEL`, update `SLACK_BOT_TOKEN`, and restart the server. The delivery ticket endpoint preserves a successfully created Linear ticket and reports the Slack failure instead of hiding the partial result.
