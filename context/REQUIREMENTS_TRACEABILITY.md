# Requirements Traceability Matrix

Codex must update the implementation link and evidence columns. “Implemented” means code and automated local tests pass; “verified live” is reserved for a fresh hosted action with recorded external IDs. The current recovery build is not release-complete until the production verification report is attached.

## Guided workflow recovery — 2026-07-12

| Requirement | Implementation | Verification |
|---|---|---|
| A first-time operator can follow the complete delivery story | Persistent Demo Guide checklist links Company context → opportunity ranking → agent analysis → feature approval → plan/build → eval campaigns → release approval → deployment → analytics → incident learning → lineage. | `tests/e2e/control-tower.spec.ts` — guided walkthrough test on desktop and mobile. |
| Eval campaigns are a visible guided step | `/evals` has a route-specific explanation and the next guided action points to the release decision. | Browser route audit plus Playwright navigation assertion. |
| Human decisions use the durable workflow | Feature and release approvals queue `/api/workflow/actions` and route to the durable run timeline; rejection remains an explicit decision endpoint. | Typecheck, lint, and workflow browser coverage. |
| Eval and review layouts remain readable | Eval matrices scroll inside their card; review gate summary and decision actions reflow at narrow widths. | Tablet/mobile overflow tests at 820px and 390px. |

| ID | Requirement | Target | Verification |
|---|---|---|---|
| R001 | Fresh-clone V1 | Whole repo | Complete — `pnpm demo`, `pnpm build`, `pnpm test` |
| R002 | Visual control tower | UI | Complete — Next routes, route-specific layouts, executable demo controls + `tests/e2e/control-tower.spec.ts` |
| R003 | Feature lineage timeline | UI + DB | Complete — `/lineage`, lineage package, Supabase migration |
| R004 | Deterministic synthetic data | Generator | Complete — same-seed test |
| R005 | Structured company files | `company/` | Complete — validator + minimum dataset; `/company` previews representative transcript/support/analytics records and links each to lineage |
| R006 | PM evidence analysis | Agent | Complete — `analyzeProductEvidence` citations |
| R007 | Recommendation not hardcoded | Agent | Complete — scenario-change acceptance test |
| R008 | Human approval gate | Workflow | Complete — serialized pause/resume test |
| R009 | Ticket creation | Connector | Complete — `/api/delivery/tickets` and `/api/workflow/sync` create normalized live Linear/GitHub Issues tickets and preserve partial success when Slack permissions reject the notification |
| R010 | Isolated engineering work | GitHub | Verified live — PRs [#3](https://github.com/xkarx/ai-delivery-evalops-control-tower/pull/3) and [#4](https://github.com/xkarx/ai-delivery-evalops-control-tower/pull/4) used distinct branches, functional commits, checks, and merge commits |
| R011 | Real code tests | CI | Complete — CI runs lint/type/test/build and browser checks |
| R012 | Real eval execution | Eval service | Complete — per-case stored measured results; live mode uses the configured OpenAI-compatible judge for semantic cases and mock mode uses the explicit deterministic fallback |
| R013 | Failed eval blocks release | Gate | Complete — EVAL-0001 blocked, EVAL-0002 passes |
| R014 | Langfuse trace links | Observability | Recovery implemented and locally verified — links include configured project ID and session-specific trace ID; fresh hosted trace creation awaits the current feature approval gate |
| R015 | Product analytics events | PostHog | Verified live — production run `TRAFFIC-20260712-0001` durably recorded 49 events for 12 users and sent the live event path to the configured PostHog project |
| R016 | Agent cost and latency | Observability | Complete — run telemetry and cost/latency view |
| R017 | Incident becomes regression | Workflow | Complete — incident conversion + lineage edge |
| R018 | Slack approval/status | Slack | Complete — approval adapter + HMAC verification |
| R019 | Linear or fallback | Connector | Complete — Linear adapter with GitHub Issues fallback |
| R020 | Supabase lineage state | Database | Verified live — session `SESSION-1783851681641`, workflow `WORKFLOW-1783851681641`, approvals, runs, previews, deployments, incident, and replay archive survived hosted refreshes through the durable repository |
| R021 | No committed credentials | Security | Complete — `.env.example` + secret scan |
| R022 | Credential-free demo mode | Adapters | Complete — `pnpm demo` without credentials |
| R023 | Live mode | Adapters | Verified live — production health reported all nine adapters readable and write-configured; the proof run recorded real external actions for every provider, with Slack using its configured default channel |
| R024 | Open-source attribution | References | Complete — `references/OPEN_SOURCE_ATTRIBUTION.md` |
| R025 | Responsive UI | UI | Implemented and locally verified — 21 Playwright checks pass and one mutating workflow check runs once instead of concurrently; mobile/desktop behavior and presentation widths 390, 768, 1024, 1280, 1440, and 1920px have no document overflow or crushed headings |
| R026 | Two independent workstreams | Orchestration | Complete — separate concurrent `RUN-*` records |
| R027 | GitHub deployment/release links | GitHub | Verified live — two PRs, green CI checks, two passing Vercel previews, merge commits, and production deployments are linked in the verification report |
| R028 | Reusable skills | Skills | Complete — 15 generic skill contracts |
| R029 | Manual connection checklist | Docs | Complete — exact user-owned steps |
| R030 | V2 arbitrary-repo path | Architecture | Complete — adapter boundary + V2 scope/ADR |
| R031 | Operator voice and Slack commands | Control plane | Complete — `/runs` voice/text command panel and signature-verified `/api/slack/commands` trigger workflow, approval, sync, status, and Linear ticket creation through shared live adapters |
| R032 | PM/UX/feasibility role loop | Agent orchestration | Complete — PM-owned implementation brief, deterministic UX and engineering-feasibility review AgentRuns, explicit PM→review→approval ordering, and TPM brief-only planning |
| R033 | Versioned company context pack | Company context | Complete — manifest/category/evidence loader with context-pack version and evidence IDs attached to the workflow start |
| R034 | Linear delivery roadmap | Delivery UI + connector | Complete — `/delivery` board with completed/backlog/active/review/blocked states, owners, dependencies, evidence, and live/mock external links plus status sync |
| R035 | Logical multi-agent Slack thread | Slack | Complete — one DailyCart bot posts PM, UX, feasibility, TPM, engineering, EvalOps, and release handoffs in one workflow thread; `/dailycart ask` and status read persisted workflow context |
| R036 | Visible product feature behavior | Customer product | Complete — checkout interruption/recovery interaction, accessible focus restoration, recovery telemetry, and workflow-created preview build action |
| R037 | Follow-along workflow console | Control plane | Complete — collapsible `/runs` console with current phase, actor, history, next action, source mode, polling, and contextual questions |
| R038 | Preview-target evaluation gate | Preview + release | Recovery implemented — Vercel readiness is polled, protection HTML becomes `PREVIEW_AUTH_FAILED`, and `preview-eval.yml` runs remote Playwright against the exact URL and commit. The first branch contains a real focus failure and correction changes actual focus logic. Fresh hosted execution awaits feature approval. |
| R039 | Guided operator flow | Control plane | Complete — persistent Demo Guide explains current phase, previous events, next action, why it matters, mode boundary, AI summary, linked records, and contextual questions |
| R040 | Executable skill provenance | Agents + traceability | Complete — versioned skill registry, role-boundary metadata, context-pack/evidence/tool provenance, and agent-run inspection |
| R041 | Two parallel feature tracks | Workflow + product | Verified live — FEAT-0001 and FEAT-0002 produced distinct branches, commits, PRs, previews, passing final checks, merge commits, and production deployment records |
| R042 | Multi-channel Slack operations | Slack | Partially verified — logical-agent handoffs, approval, release, and incident messages were written live, but all used default channel `C0BGNTCJBKL`; four distinct channels still require user-owned channel IDs and bot membership |
| R043 | Editable eval workbench | EvalOps | Complete — operator can author versioned cases, select cases, execute deterministic/model graders, and inspect measured gate results |
| R044 | Operator-only live actions | Deployment security | Verified live — anonymous workflow start returned HTTP 401, signed operator sessions allowed writes, and the internal traffic token authorized server-to-product traffic without exposing provider secrets |
| R045 | Durable background execution proof | Orchestration | Hosted recovery verified — `ACTION-846FDD6CE74E` advanced through the service-authorized recovery worker from queued to the feature-approval gate with one attempt, durable heartbeats, eight agent/eval stages, and no duplicate action. Inngest emission remains enabled; the direct idempotent worker prevents a missing cloud registration from leaving a run stuck. |
| R046 | Refresh-safe guided workflow recovery | Control plane + orchestration | Implemented and production-verified — after a full reload the canonical `/runs` page restored `SESSION-1783897727709`, `WORKFLOW-1783897744823044D`, `ACTION-846FDD6CE74E`, 100% progress, eight stage records, both recommendations, and the `approve_feature` human gate. |
| R047 | Permission-tolerant preview evaluation and exact-step retry | EvalOps + orchestration | Production-verified — a GitHub `workflow_dispatch` 403 falls back to `repository_dispatch`; retry reuses existing plan, provider records, PRs, and READY previews. FEAT-0001 failed focus restoration, correction `10ec2f2` passed [run 29216966634](https://github.com/xkarx/ai-delivery-evalops-control-tower/actions/runs/29216966634), and FEAT-0002 passed [run 29217001688](https://github.com/xkarx/ai-delivery-evalops-control-tower/actions/runs/29217001688). |
