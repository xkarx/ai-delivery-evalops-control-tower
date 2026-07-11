# Implementation Status

| Phase | Status | Branch/PR | Tests | Notes |
|---|---|---|---|---|
| 00 Bootstrap | Complete | local V1 | `tsc`, `vitest`, `eslint`, Next build | pnpm workspace, Zod contracts, Supabase migration, CI, mode config, adapter boundaries, and responsive shell |
| 01 Sample product | Complete | local customer surface + HTTP sidecar | `tests/sample-product.test.ts`, `/product`, `/analytics`, `/api/dailycart/traffic` | Interactive DailyCart customer surface with catalogue/search/cart/checkout, persistent customers, operator-controlled deterministic traffic scenarios (users/spawn/duration/seed/scenario/caps), funnel, exposure/failure events, event JSONL, and teardown contract. The local sidecar also satisfies the live adapter contract over HTTP; Google Online Boutique remains the production-like external sidecar option. |
| 02 Company data | Complete | local generator + clickable evidence browser | `tests/company-data.test.ts`, `/company` | 50 customers, 8 interviews, 30 support tickets, 20 requests, 15 bugs, 30+ eval cases, deterministic reference validator, preview cards and lineage links for representative records |
| 03 PM workflow | Complete | RUN-0100 / DEC-0001 | `tests/agents-core.test.ts` | Evidence-derived ranking, scenario-change behavior, citations, PM-owned PRD, risks, milestones, and approval pause/resume |
| 04 Delivery | Complete | RUN-0101 / RUN-0102 / RUN-0103 | `tests/agents-core.test.ts` | TPM reviews PRD/scope, decomposes work, maps dependencies/risk, prepares readiness; two concurrent independent workstreams, isolated branch names, PR/check records, ticket and lineage links |
| 05 EvalOps | Complete | EVAL-0001 → EVAL-0002 | `tests/evals-core.test.ts` | Per-case measured results, deterministic graders, optional live OpenAI-compatible semantic judge in live mode, human calibration, critical block, corrected pass |
| 06 Control tower | Complete | local Next app | 10 Playwright checks + Next build | Overview plus the required operational views, customer-product navigation, route-specific layouts (evals/incidents/analytics/company/features/lineage/releases/reviews/runs/settings), charts, review queue, health cards, responsive CSS with tablet/mobile overflow regression coverage, and executable Run demo/Reset scenario controls |
| 07 Integrations | Complete | mock/live adapters | `tests/connectors*.test.ts`, `/api/integrations/health` | GitHub, Slack, Linear/GitHub Issues, Supabase, Langfuse, PostHog, Inngest, Vercel, and sample-product adapters. Ticket creation (`/api/delivery/tickets`), demo-run status notification, product-event capture, bounded traffic generation (`/api/product/traffic`), and workflow synchronization (`/api/workflow/sync`) exercise the adapter boundary. Langfuse trace and score writes use the current public write endpoint. |
| 07b Operator commands | Complete | dashboard + Slack command adapter | `/runs`, `/api/operator/command`, `/api/slack/commands` | Browser voice/text commands trigger the same workflow/ticket/sync/status actions as the dashboard. Slack slash commands are signature-verified and reply in-channel; Slack `chat:write` permission is still required for outbound replies. |
| 08 Demo hardening | Complete | `pnpm demo` | `demo-verify`, secret scan, CI config | Reset/run/verify scripts, runbook, troubleshooting, architecture diagram, attribution, release notes, Playwright coverage |

## Risks

- Live provider writes are now exercised where credentials permit; production deployment remains blocked only by the missing Vercel project identifier, and Slack message writes remain blocked by the bot's missing `chat:write` scope.
- The default control tower uses a checked-in fallback fixture when `artifacts/demo-state.json` is absent, while `pnpm demo` regenerates measured state.
- `INTEGRATION_MODE=mock` is deliberately credential-free: it records realistic adapter results locally and does not create real Slack, GitHub, Linear, PostHog, or deployment records.
- The local `/product` route is the V1 customer-facing DailyCart surface. The upstream Google Online Boutique repository is referenced and contract-compatible, but is not silently cloned or deployed by this repository. Company data is synthetic by design; the evidence browser makes those records previewable and links them into lineage.
- The local server is running with `INTEGRATION_MODE=live`, the authenticated GitHub repository, the local HTTP product sidecar, and the configured Vercel project. Current health is healthy for GitHub, Slack auth, Linear, Supabase, Langfuse, PostHog, Vercel, Inngest, and sample-product. A production Vercel deployment is ready at `ai-delivery-evalops-control-tower-control-tower-kr2gcmq8s.vercel.app`. Slack auth is healthy but message writes require `chat:write`. A live workflow created Linear issues DAI-7 through DAI-9, emitted an Inngest event, and ingested a Langfuse trace/score.

## Assumptions

- pnpm workspaces are sufficient for V1 orchestration; Turborepo is not needed for the current package graph.
- The Google Online Boutique remains the recommended production-like sidecar/reference. The local DailyCart product surface and HTTP traffic sidecar provide a complete live adapter path until a user-owned external deployment URL is supplied.

## Manual connection blockers

- GitHub App installation/repository selection, Slack app authorization, Linear or GitHub Issues target, Supabase/Langfuse/PostHog projects, and deployment target are user-owned actions.

## Deferred to V2

- Arbitrary repository onboarding, multi-tenant RBAC, durable production queues, staged rollout/rollback, policy packs, and connector SDK (see `docs/V2_SCOPE.md`).
