# Implementation Status

| Phase | Status | Branch/PR | Tests | Notes |
|---|---|---|---|---|
| 00 Bootstrap | Complete | local V1 | `tsc`, `vitest`, `eslint`, Next build | pnpm workspace, Zod contracts, Supabase migration, CI, mode config, adapter boundaries, and responsive shell |
| 01 Sample product | Complete | local customer surface + HTTP sidecar | `tests/sample-product.test.ts`, `/product`, `/analytics`, `/api/dailycart/traffic` | Interactive DailyCart customer surface with catalogue/search/cart/checkout, persistent customers, operator-controlled deterministic traffic scenarios (users/spawn/duration/seed/scenario/caps), funnel, exposure/failure events, event JSONL, and teardown contract. The local sidecar also satisfies the live adapter contract over HTTP; Google Online Boutique remains the production-like external sidecar option. |
| 02 Company data | Complete | local generator + clickable evidence browser | `tests/company-data.test.ts`, `/company` | 50 customers, 8 interviews, 30 support tickets, 20 requests, 15 bugs, 30+ eval cases, deterministic reference validator, preview cards and lineage links for representative records |
| 03 PM workflow | Complete | RUN-0100 / BATCH-0101 / UX-0200 / EXT-0210 | `tests/agents-core.test.ts`, `tests/context-pack.test.ts`, `tests/skills.test.ts` | Versioned company context pack, two evidence-ranked feature tracks, PM-owned implementation briefs, UX and engineering-feasibility review runs, citations, risks, skill/version provenance, and approval pause/resume |
| 04 Delivery | Complete | RUN-0101 / RUN-0102 / RUN-0103 | `tests/agents-core.test.ts`, `/delivery` | Approved PM scope becomes two concurrent workstreams with dependencies, owners, readiness checks, Linear roadmap/status sync, and external ticket metadata |
| 05 EvalOps | Complete | EVAL-0001 → EVAL-0002 | `tests/evals-core.test.ts` | Per-case measured results, deterministic graders, optional live OpenAI-compatible semantic judge in live mode, human calibration, critical block, corrected pass |
| 06 Control tower | Hosted synchronized walkthrough verified | [PR #10](https://github.com/xkarx/ai-delivery-evalops-control-tower/pull/10) · merge `0873774` | lint, typecheck, 54 unit/integration tests, Next production build, Playwright 25 passed + 1 intentionally skipped duplicate mutation; [quality](https://github.com/xkarx/ai-delivery-evalops-control-tower/actions/runs/29224720604/job/86736433481) and [browser](https://github.com/xkarx/ai-delivery-evalops-control-tower/actions/runs/29224720604/job/86736575822) checks passed | Production at [the canonical control tower](https://ai-delivery-evalops-control-tower-c.vercel.app) now separates durable execution from a session-specific presentation chapter, so background completion cannot skip the operator story. Manual navigation pauses auto-follow; refresh restores the chapter. Hosted browser verification confirmed the responsive journey drawer, live agent/provider activity, decision packets, and final delivery report. |
| 07 Integrations | Verified live with one Slack-channel limitation | live adapters | `tests/connectors*.test.ts`, live health checks, external action receipts | The hosted release packet and delivery activity show Linear DAI-33 through DAI-40, GitHub PRs #8 and #9 with commits/checks, two Vercel previews, Slack thread `1783911674453209`, Langfuse trace `dailycart-workflow-178391155174965f2bc957852`, Inngest event `01KXCPR1YVAKARZKSQ0E22T26Z`, and durable Supabase workflow records. Slack messages currently use the configured default channel; distinct delivery/approvals/alerts/analytics channels remain configuration-blocked. |
| 07b Operator commands | Complete | dashboard + Slack command adapter | `/runs`, `/api/operator/command`, `/api/slack/commands`, `/api/workflow/ask` | Browser voice/text commands, contextual workflow questions, logical-agent Slack handoffs, approval, sync, status, and ticket creation share one command path. |
| 08 Demo hardening | Hosted production verified | [delivery report](https://ai-delivery-evalops-control-tower-c.vercel.app/runs/summary) · workflow `WORKFLOW-178391155174965F2BC957852` | hosted route inspection plus the PR #10 quality/browser suite | The report renders 20 agent runs, two product builds, two passing preview evaluations, human decisions, cost/latency, warnings, and real external provider links. Human Review renders the release approval packet, Delivery renders provider activity cards, and raw JSON remains secondary under technical details. PostHog and Supabase dashboard cards honestly remain unavailable until safe dashboard URLs are configured. |

## Risks and release blockers

- The core end-to-end path has hosted external proof. Strict acceptance is still blocked on configuring and verifying four distinct Slack channels; all current messages use the configured default channel.
- The synchronized hosted workflow is production-verified. A distinct Inngest event is linked from the report; provider dashboards remain the authoritative place to inspect execution details.
- `INTEGRATION_MODE=mock` remains deliberately credential-free and never presents local adapter records as live provider success.
- Company and customer inputs are synthetic by design. In live mode, model calls, workflow records, approvals, provider actions, code changes, previews, evaluations, deployments, product events, and incident feedback must be executed and labelled from their actual source.
- Any failed provider write, preview check, model call, or deployment is a stop-ship blocker and will be recorded rather than replaced with a fabricated success.
- Safe PostHog and Supabase dashboard URLs are not configured, so those two provider cards show an explicit unavailable state rather than fabricating a link. Their underlying event/state adapters remain separately verified.

## Assumptions

- pnpm workspaces are sufficient for V1 orchestration; Turborepo is not needed for the current package graph.
- The Google Online Boutique remains the recommended production-like sidecar/reference. The local DailyCart product surface and HTTP traffic sidecar provide a complete live adapter path until a user-owned external deployment URL is supplied.

## Manual connection blockers

- Add the bot to separate Slack delivery, approvals, alerts, and analytics channels and configure their channel IDs. The existing default-channel write path is live and verified.
- Verify the Slack slash-command Request URL in the user-owned Slack app configuration before relying on Slack as the sole control surface.

## Deferred to V2

- Arbitrary repository onboarding, multi-tenant RBAC, full phase-by-phase asynchronous orchestration, staged rollout/rollback, policy packs, and connector SDK (see `docs/V2_SCOPE.md`).
