# Requirements Traceability Matrix

Codex must update the implementation link and evidence columns.

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
| R010 | Isolated engineering work | GitHub | Complete — isolated branch/PR records in mock executor |
| R011 | Real code tests | CI | Complete — CI runs lint/type/test/build and browser checks |
| R012 | Real eval execution | Eval service | Complete — per-case stored measured results; live mode uses the configured OpenAI-compatible judge for semantic cases and mock mode uses the explicit deterministic fallback |
| R013 | Failed eval blocks release | Gate | Complete — EVAL-0001 blocked, EVAL-0002 passes |
| R014 | Langfuse trace links | Observability | Complete — live workflow sync ingests a trace and boolean score through the public Langfuse write API; trace IDs remain linked in runs |
| R015 | Product analytics events | PostHog | Complete — `/product` emits real interaction events, `/api/product/events` captures them, `/analytics` exposes bounded user/spawn/duration/scenario/seed/cap controls through `/api/product/traffic`, local JSONL is surfaced in `/analytics`, and PostHog is used in live mode |
| R016 | Agent cost and latency | Observability | Complete — run telemetry and cost/latency view |
| R017 | Incident becomes regression | Workflow | Complete — incident conversion + lineage edge |
| R018 | Slack approval/status | Slack | Complete — approval adapter + HMAC verification |
| R019 | Linear or fallback | Connector | Complete — Linear adapter with GitHub Issues fallback |
| R020 | Supabase lineage state | Database | Complete — migration + database adapter |
| R021 | No committed credentials | Security | Complete — `.env.example` + secret scan |
| R022 | Credential-free demo mode | Adapters | Complete — `pnpm demo` without credentials |
| R023 | Live mode | Adapters | Complete — `/api/integrations/health`, workflow sync, ticket, Slack, analytics, sample-product sidecar, and Vercel deployment paths use live adapters when `INTEGRATION_MODE=live`; the Integrations page now probes adapters on initial load as well as on demand |
| R024 | Open-source attribution | References | Complete — `references/OPEN_SOURCE_ATTRIBUTION.md` |
| R025 | Responsive UI | UI | Complete — route-specific desktop/mobile layouts + Playwright mobile project |
| R026 | Two independent workstreams | Orchestration | Complete — separate concurrent `RUN-*` records |
| R027 | GitHub deployment/release links | GitHub | Complete — authenticated GitHub repository health and normalized links in code-host/deployment adapters; Vercel deployment is gated on project ID |
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
| R038 | Preview-target evaluation gate | Preview + release | Complete — preview build records a target URL, `/api/workflow/preview-eval` probes/evaluates that target, persists checks and source mode, and release approval/deployment reject missing or failing preview results |
| R039 | Guided operator flow | Control plane | Complete — persistent Demo Guide explains current phase, previous events, next action, why it matters, mode boundary, AI summary, linked records, and contextual questions |
| R040 | Executable skill provenance | Agents + traceability | Complete — versioned skill registry, role-boundary metadata, context-pack/evidence/tool provenance, and agent-run inspection |
| R041 | Two parallel feature tracks | Workflow + product | Complete — two PM-ranked features receive approval, TPM plans, engineering runs, previews, preview evals, and production deployment records in one batch |
| R042 | Multi-channel Slack operations | Slack | Complete — one bot fans the workflow into delivery, approvals, alerts, and analytics channels when channel IDs are configured, with shared workflow/thread metadata |
| R043 | Editable eval workbench | EvalOps | Complete — operator can author versioned cases, select cases, execute deterministic/model graders, and inspect measured gate results |
| R044 | Operator-only live actions | Deployment security | Complete — live writes/model calls/replay/reset require an HttpOnly operator session; read-only browsing remains available |
