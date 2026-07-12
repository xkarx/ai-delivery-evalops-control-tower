# Implementation Status

| Phase | Status | Branch/PR | Tests | Notes |
|---|---|---|---|---|
| 00 Bootstrap | Complete | local V1 | `tsc`, `vitest`, `eslint`, Next build | pnpm workspace, Zod contracts, Supabase migration, CI, mode config, adapter boundaries, and responsive shell |
| 01 Sample product | Complete | local customer surface + HTTP sidecar | `tests/sample-product.test.ts`, `/product`, `/analytics`, `/api/dailycart/traffic` | Interactive DailyCart customer surface with catalogue/search/cart/checkout, persistent customers, operator-controlled deterministic traffic scenarios (users/spawn/duration/seed/scenario/caps), funnel, exposure/failure events, event JSONL, and teardown contract. The local sidecar also satisfies the live adapter contract over HTTP; Google Online Boutique remains the production-like external sidecar option. |
| 02 Company data | Complete | local generator + clickable evidence browser | `tests/company-data.test.ts`, `/company` | 50 customers, 8 interviews, 30 support tickets, 20 requests, 15 bugs, 30+ eval cases, deterministic reference validator, preview cards and lineage links for representative records |
| 03 PM workflow | Complete | RUN-0100 / BATCH-0101 / UX-0200 / EXT-0210 | `tests/agents-core.test.ts`, `tests/context-pack.test.ts`, `tests/skills.test.ts` | Versioned company context pack, two evidence-ranked feature tracks, PM-owned implementation briefs, UX and engineering-feasibility review runs, citations, risks, skill/version provenance, and approval pause/resume |
| 04 Delivery | Complete | RUN-0101 / RUN-0102 / RUN-0103 | `tests/agents-core.test.ts`, `/delivery` | Approved PM scope becomes two concurrent workstreams with dependencies, owners, readiness checks, Linear roadmap/status sync, and external ticket metadata |
| 05 EvalOps | Complete | EVAL-0001 → EVAL-0002 | `tests/evals-core.test.ts` | Per-case measured results, deterministic graders, optional live OpenAI-compatible semantic judge in live mode, human calibration, critical block, corrected pass |
| 06 Control tower | Implemented; hosted proof pending | recovery build | Playwright 21 passed + 1 intentionally single-project mutation check at 390/768/1024/1280/1440/1920px + Next build | Durable action feedback, first-visit Demo Guide with reliable reopen control, interactive company/eval/review/incident/lineage screens, responsive roadmap and run telemetry, operator authorization, replay/reset, and neutral slate/teal visual system |
| 07 Integrations | Implemented; hosted action proof pending | mock/live adapters | `tests/connectors*.test.ts`, `/api/integrations/health`, `/delivery` | GitHub branch/commit/PR primitives, multi-channel Slack logical-agent fan-out and commands, Linear roadmap/status sync, durable Supabase Storage artifacts and structured records, Langfuse observations/scores, PostHog events, Inngest event evidence, Vercel preview/production paths, and service-authorized sample-product traffic. Each remains incomplete until the fresh hosted verification report contains its external IDs. |
| 07b Operator commands | Complete | dashboard + Slack command adapter | `/runs`, `/api/operator/command`, `/api/slack/commands`, `/api/workflow/ask` | Browser voice/text commands, contextual workflow questions, logical-agent Slack handoffs, approval, sync, status, and ticket creation share one command path. |
| 08 Demo hardening | Implemented locally; production stop-ship active | recovery branch | lint, typecheck, 50 unit tests, Next production build, 22 browser tests, secret scan | The release is not marked demo-ready until a fresh production session proves model-backed agent runs, provider writes, two previews, blocked/corrected evals, approval, deployment, product events, incident conversion, refresh persistence, and replay. |

## Risks and release blockers

- Passing local checks proves implementation quality, not live provider behavior. Fresh hosted external IDs and links are still required before V1 can be called demo-ready.
- `INTEGRATION_MODE=mock` remains deliberately credential-free and never presents local adapter records as live provider success.
- Company and customer inputs are synthetic by design. In live mode, model calls, workflow records, approvals, provider actions, code changes, previews, evaluations, deployments, product events, and incident feedback must be executed and labelled from their actual source.
- Any failed provider write, preview check, model call, or deployment is a stop-ship blocker and will be recorded rather than replaced with a fabricated success.

## Assumptions

- pnpm workspaces are sufficient for V1 orchestration; Turborepo is not needed for the current package graph.
- The Google Online Boutique remains the recommended production-like sidecar/reference. The local DailyCart product surface and HTTP traffic sidecar provide a complete live adapter path until a user-owned external deployment URL is supplied.

## Manual connection blockers

- GitHub App installation/repository selection, Slack app authorization, Linear or GitHub Issues target, Supabase/Langfuse/PostHog projects, and deployment target are user-owned actions.

## Deferred to V2

- Arbitrary repository onboarding, multi-tenant RBAC, durable production queues, staged rollout/rollback, policy packs, and connector SDK (see `docs/V2_SCOPE.md`).
