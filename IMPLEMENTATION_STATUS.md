# Implementation Status

| Phase | Status | Branch/PR | Tests | Notes |
|---|---|---|---|---|
| 00 Bootstrap | Complete | local V1 | `tsc`, `vitest`, `eslint`, Next build | pnpm workspace, Zod contracts, Supabase migration, CI, mode config, adapter boundaries, and responsive shell |
| 01 Sample product | Complete | local mock adapter | `tests/sample-product.test.ts` | Persistent customers, deterministic traffic scenarios, funnel, exposure/failure events, caps, cost controls, and teardown contract |
| 02 Company data | Complete | local generator | `tests/company-data.test.ts` | 50 customers, 8 interviews, 30 support tickets, 20 requests, 15 bugs, 30+ eval cases, deterministic reference validator |
| 03 PM workflow | Complete | RUN-0100 / DEC-0001 | `tests/agents-core.test.ts` | Evidence-derived ranking, scenario-change behavior, citations, PRD, risks, milestones, and approval pause/resume |
| 04 Delivery | Complete | RUN-0102 / RUN-0103 | `tests/agents-core.test.ts` | Two concurrent independent workstreams, isolated branch names, PR/check records, ticket and lineage links |
| 05 EvalOps | Complete | EVAL-0001 → EVAL-0002 | `tests/evals-core.test.ts` | Per-case measured results, deterministic graders, mocked semantic judge, human calibration, critical block, corrected pass |
| 06 Control tower | Complete | local Next app | Playwright spec + Next build | Overview plus all 11 required views, route-specific operational layouts (evals/incidents/analytics/company/features/lineage/releases/reviews/runs/settings), charts, review queue, health cards, responsive CSS, and executable Run demo/Reset scenario controls |
| 07 Integrations | Complete | mock/live adapters | `tests/connectors*.test.ts`, `/api/integrations/health` | GitHub, Slack, Linear/GitHub Issues, Supabase, Langfuse, PostHog, Inngest, Vercel, and sample-product adapters with live read-only health route |
| 08 Demo hardening | Complete | `pnpm demo` | `demo-verify`, secret scan, CI config | Reset/run/verify scripts, runbook, troubleshooting, architecture diagram, attribution, release notes, Playwright coverage |

## Risks

- Live provider writes and production deployment remain unverified until the user supplies provider authorization; all adapter code and exact setup steps are present.
- The default control tower uses a checked-in fallback fixture when `artifacts/demo-state.json` is absent, while `pnpm demo` regenerates measured state.

## Assumptions

- pnpm workspaces are sufficient for V1 orchestration; Turborepo is not needed for the current package graph.
- The Google Online Boutique remains a provider reference/contract in V1; the local traffic sidecar keeps the demo credential-free.

## Manual connection blockers

- GitHub App installation/repository selection, Slack app authorization, Linear or GitHub Issues target, Supabase/Langfuse/PostHog projects, and deployment target are user-owned actions.

## Deferred to V2

- Arbitrary repository onboarding, multi-tenant RBAC, durable production queues, staged rollout/rollback, policy packs, and connector SDK (see `docs/V2_SCOPE.md`).
