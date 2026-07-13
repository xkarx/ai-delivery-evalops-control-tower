# Troubleshooting

## `pnpm` is unavailable

Node 20+ ships Corepack. Run `corepack enable` once, then use `corepack pnpm`. The repository pins pnpm 11.7.0.

## Demo state is stale

Run `corepack pnpm demo:reset && corepack pnpm demo` and confirm `artifacts/demo-state.json` was recreated. The seed is controlled by `SYNTHETIC_DATA_SEED`.

For the hosted flow, use `/demo` and start a new session instead of relying on a deep-linked page or a previous tab. A session is isolated and survives refresh; **Replay** archives the current session and preserves external audit records. Showcase runs one feature; Full Verification runs two features and the correction path. Live writes in either profile require `INTEGRATION_MODE=live`, provider configuration, operator unlock, and a sample-product target.

## Connected mode reports unconfigured

This is intentional until the provider's read-only health variables are present. Keep `INTEGRATION_MODE=mock` for local demos; never paste credentials into this repository.

## The UI says mocked or simulated

That label is the source-of-truth for the current path. In `INTEGRATION_MODE=mock`, `/product`, **Generate traffic**, **Create delivery ticket**, and **Run demo** execute locally and persist evidence, but they do not contact Slack, Linear, GitHub, PostHog, or a deployed product. In live mode, the local `/api/dailycart/traffic` sidecar can be used as the product target (`SAMPLE_PRODUCT_URL=http://localhost:3000`) so the traffic controls exercise a real HTTP adapter; an external Google Online Boutique deployment can replace it later.

When live mode is active, the integration cards distinguish read-only health from write configuration. A provider can pass health and still reject a write (for example Slack `missing_scope`); the action result now reports the provider error and preserves any earlier successful ticket creation.

## The cockpit appears to be waiting

Waiting is expected whenever live providers are active. Typical estimates are 30–90 seconds for agent analysis, 30–90 seconds for provider synchronization, 1–3 minutes for each Vercel preview, 1–3 minutes for each preview browser evaluation, and 2–5 minutes for a correction/rebuild/rerun. Feature and release approval phases wait indefinitely for a human. Watch `Last update`, the phase estimate, and the chronological event stream. The recovery worker retries the same idempotent action when the heartbeat expires; starting another session creates a different audit trail and does not speed up the current one.

## A green agent score but a blocked release

Agent-output evaluation grades the structured response from PM, UX, feasibility, or another role: evidence grounding, scope, criteria, and provenance. Preview evaluation runs browser/accessibility checks against the exact commit and preview URL. A good agent answer cannot make a broken preview releasable. A passing preview still requires the configured release policy and a human release approval.

## Provider links are missing

Use the provider card for the stage that caused the action. `artifactUrl` is the exact external record (ticket, message, PR, preview, event); `dashboardUrl` is a provider-wide view and may be unavailable if a safe dashboard URL is not configured. A health URL or configured credential is not an action receipt. In either profile, fallback records deliberately have no fabricated live provider link.

## The UI says “live” but a record says “fallback”

The runtime mode and each record's source mode answer different questions. `INTEGRATION_MODE=live` enables live adapters, but an individual operation can still be a deterministic fallback when its provider is unconfigured or a safe capability is unavailable. The app must show that fallback rather than claiming a live success. Check **Integrations**, the action error, and the external link together.

## Slack commands and operator voice

Configure the Slack app's slash-command Request URL as `https://<your-control-tower-host>/api/slack/commands`. The endpoint verifies Slack's signing secret and accepts `run workflow`, `approve release`, `create ticket: <title>`, `sync delivery`, and `status`. The `/runs` page exposes the same commands through text input or browser speech recognition. Outbound replies require the bot OAuth scope `chat:write`.

## Playwright cannot find a browser

Run `corepack pnpm exec playwright install chromium`, or let the CI workflow install browsers with `--with-deps`.

## Supabase writes fail

Apply `supabase/migrations/0001_control_tower.sql` first, verify RLS, then rerun the integration health page. The service-role key belongs only in the server/worker secret store.

## Slack health is green but messages fail with `missing_scope`

Slack `auth.test` proves the bot token is valid, but posting requires the bot OAuth scope `chat:write`. Add that scope in the Slack app, reinstall/re-authorize the app, invite the bot to `SLACK_DEFAULT_CHANNEL`, update `SLACK_BOT_TOKEN`, and restart the server. The delivery ticket endpoint preserves a successfully created Linear ticket and reports the Slack failure instead of hiding the partial result.
