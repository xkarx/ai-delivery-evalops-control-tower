# Troubleshooting

## `pnpm` is unavailable

Node 20+ ships Corepack. Run `corepack enable` once, then use `corepack pnpm`. The repository pins pnpm 11.7.0.

## Demo state is stale

Run `corepack pnpm demo:reset && corepack pnpm demo` and confirm `artifacts/demo-state.json` was recreated. The seed is controlled by `SYNTHETIC_DATA_SEED`.

## Connected mode reports unconfigured

This is intentional until the provider's read-only health variables are present. Keep `INTEGRATION_MODE=mock` for local demos; never paste credentials into this repository.

## Playwright cannot find a browser

Run `corepack pnpm exec playwright install chromium`, or let the CI workflow install browsers with `--with-deps`.

## Supabase writes fail

Apply `supabase/migrations/0001_control_tower.sql` first, verify RLS, then rerun the integration health page. The service-role key belongs only in the server/worker secret store.
