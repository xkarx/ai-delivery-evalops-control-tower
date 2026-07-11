# Implementation Status

| Phase | Status | Branch/PR | Tests | Notes |
|---|---|---|---|---|
| 00 Bootstrap | Complete | local V1 | `tsc`, `vitest`, `eslint`, Next build | pnpm workspace, Zod contracts, Supabase migration, CI, mode config, adapter boundaries, and responsive shell |
| 01 Sample product | Complete | local mock adapter | `tests/sample-product.test.ts`, `/product` | Interactive DailyCart customer surface with catalogue/search/cart/checkout, persistent customers, deterministic traffic scenarios, funnel, exposure/failure events, caps, cost controls, event JSONL, and teardown contract. Google Online Boutique deployment remains an optional external sidecar. |
| 02 Company data | Complete | local generator | `tests/company-data.test.ts` | 50 customers, 8 interviews, 30 support tickets, 20 requests, 15 bugs, 30+ eval cases, deterministic reference validator |
| 03 PM workflow | Complete | RUN-0100 / DEC-0001 | `tests/agents-core.test.ts` | Evidence-derived ranking, scenario-change behavior, citations, PRD, risks, milestones, and approval pause/resume |
| 04 Delivery | Complete | RUN-0102 / RUN-0103 | `tests/agents-core.test.ts` | Two concurrent independent workstreams, isolated branch names, PR/check records, ticket and lineage links |
| 05 EvalOps | Complete | EVAL-0001 → EVAL-0002 | `tests/evals-core.test.ts` | Per-case measured results, deterministic graders, mocked semantic judge, human calibration, critical block, corrected pass |
| 06 Control tower | Complete | local Next app | 10 Playwright checks + Next build | Overview plus the required operational views, customer-product navigation, route-specific layouts (evals/incidents/analytics/company/features/lineage/releases/reviews/runs/settings), charts, review queue, health cards, responsive CSS with tablet/mobile overflow regression coverage, and executable Run demo/Reset scenario controls |
| 07 Integrations | Complete | mock/live adapters | `tests/connectors*.test.ts`, `/api/integrations/health` | GitHub, Slack, Linear/GitHub Issues, Supabase, Langfuse, PostHog, Inngest, Vercel, and sample-product adapters. Ticket creation (`/api/delivery/tickets`), demo-run status notification, product-event capture, and bounded traffic generation (`/api/product/traffic`) now exercise the adapter boundary. Live writes still require user authorization. |
| 08 Demo hardening | Complete | `pnpm demo` | `demo-verify`, secret scan, CI config | Reset/run/verify scripts, runbook, troubleshooting, architecture diagram, attribution, release notes, Playwright coverage |

## Risks

- Live provider writes and production deployment remain unverified until the user supplies provider authorization; all adapter code and exact setup steps are present.
- The default control tower uses a checked-in fallback fixture when `artifacts/demo-state.json` is absent, while `pnpm demo` regenerates measured state.
- `INTEGRATION_MODE=mock` is deliberately credential-free: it records realistic adapter results locally and does not create real Slack, GitHub, Linear, PostHog, or deployment records.
- The local `/product` route is the V1 customer-facing DailyCart surface. The upstream Google Online Boutique repository is referenced and contract-compatible, but is not silently cloned or deployed by this repository.

## Assumptions

- pnpm workspaces are sufficient for V1 orchestration; Turborepo is not needed for the current package graph.
- The Google Online Boutique remains the recommended production-like sidecar/reference. The local DailyCart product surface and traffic adapter provide a complete credential-free path until a user-owned deployment URL is supplied.

## Manual connection blockers

- GitHub App installation/repository selection, Slack app authorization, Linear or GitHub Issues target, Supabase/Langfuse/PostHog projects, and deployment target are user-owned actions.

## Deferred to V2

- Arbitrary repository onboarding, multi-tenant RBAC, durable production queues, staged rollout/rollback, policy packs, and connector SDK (see `docs/V2_SCOPE.md`).
