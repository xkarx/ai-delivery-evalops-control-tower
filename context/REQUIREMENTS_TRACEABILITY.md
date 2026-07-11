# Requirements Traceability Matrix

Codex must update the implementation link and evidence columns.

| ID | Requirement | Target | Verification |
|---|---|---|---|
| R001 | Fresh-clone V1 | Whole repo | Complete — `pnpm demo`, `pnpm build`, `pnpm test` |
| R002 | Visual control tower | UI | Complete — Next routes + `tests/e2e/control-tower.spec.ts` |
| R003 | Feature lineage timeline | UI + DB | Complete — `/lineage`, lineage package, Supabase migration |
| R004 | Deterministic synthetic data | Generator | Complete — same-seed test |
| R005 | Structured company files | `company/` | Complete — validator + minimum dataset |
| R006 | PM evidence analysis | Agent | Complete — `analyzeProductEvidence` citations |
| R007 | Recommendation not hardcoded | Agent | Complete — scenario-change acceptance test |
| R008 | Human approval gate | Workflow | Complete — serialized pause/resume test |
| R009 | Ticket creation | Connector | Complete — deterministic mock and live scaffold |
| R010 | Isolated engineering work | GitHub | Complete — isolated branch/PR records in mock executor |
| R011 | Real code tests | CI | Complete — CI runs lint/type/test/build and browser checks |
| R012 | Real eval execution | Eval service | Complete — per-case stored measured results |
| R013 | Failed eval blocks release | Gate | Complete — EVAL-0001 blocked, EVAL-0002 passes |
| R014 | Langfuse trace links | Observability | Complete — trace adapter + trace IDs in runs |
| R015 | Product analytics events | PostHog | Complete — event schema, traffic, funnel, PostHog adapter |
| R016 | Agent cost and latency | Observability | Complete — run telemetry and cost/latency view |
| R017 | Incident becomes regression | Workflow | Complete — incident conversion + lineage edge |
| R018 | Slack approval/status | Slack | Complete — approval adapter + HMAC verification |
| R019 | Linear or fallback | Connector | Complete — Linear adapter with GitHub Issues fallback |
| R020 | Supabase lineage state | Database | Complete — migration + database adapter |
| R021 | No committed credentials | Security | Complete — `.env.example` + secret scan |
| R022 | Credential-free demo mode | Adapters | Complete — `pnpm demo` without credentials |
| R023 | Live mode | Adapters | Complete — live health-check scaffolds, manual verification pending credentials |
| R024 | Open-source attribution | References | Complete — `references/OPEN_SOURCE_ATTRIBUTION.md` |
| R025 | Responsive UI | UI | Complete — mobile CSS + Playwright mobile project |
| R026 | Two independent workstreams | Orchestration | Complete — separate concurrent `RUN-*` records |
| R027 | GitHub deployment/release links | GitHub | Complete — normalized links in code-host/deployment adapters |
| R028 | Reusable skills | Skills | Complete — 15 generic skill contracts |
| R029 | Manual connection checklist | Docs | Complete — exact user-owned steps |
| R030 | V2 arbitrary-repo path | Architecture | Complete — adapter boundary + V2 scope/ADR |
