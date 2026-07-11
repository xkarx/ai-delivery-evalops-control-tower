# Requirements Traceability Matrix

Codex must update the implementation link and evidence columns.

| ID | Requirement | Target | Verification |
|---|---|---|---|
| R001 | Fresh-clone V1 | Whole repo | Smoke test |
| R002 | Visual control tower | UI | Playwright |
| R003 | Feature lineage timeline | UI + DB | Complete click-through |
| R004 | Deterministic synthetic data | Generator | Same seed, same output |
| R005 | Structured company files | `company/` | Schema validation |
| R006 | PM evidence analysis | Agent | Valid cited evidence IDs |
| R007 | Recommendation not hardcoded | Agent | Scenario-change test |
| R008 | Human approval gate | Workflow | Pause/resume test |
| R009 | Ticket creation | Connector | Live or verified mock |
| R010 | Isolated engineering work | GitHub | Branch/worktree and PR |
| R011 | Real code tests | CI | Check results |
| R012 | Real eval execution | Eval service | Per-case stored results |
| R013 | Failed eval blocks release | Gate | Demonstrated block |
| R014 | Langfuse trace links | Observability | Open linked trace |
| R015 | Product analytics events | PostHog | Events and funnel |
| R016 | Agent cost and latency | Observability | Run metrics |
| R017 | Incident becomes regression | Workflow | Linked eval case |
| R018 | Slack approval/status | Slack | Interactive flow |
| R019 | Linear or fallback | Connector | Synced ticket |
| R020 | Supabase lineage state | Database | Lineage query |
| R021 | No committed credentials | Security | Secret scan |
| R022 | Credential-free demo mode | Adapters | End-to-end run |
| R023 | Live mode | Adapters | Health checks |
| R024 | Open-source attribution | References | License record |
| R025 | Responsive UI | UI | Desktop/mobile tests |
| R026 | Two independent workstreams | Orchestration | Separate run records |
| R027 | GitHub deployment/release links | GitHub | External links |
| R028 | Reusable skills | Skills | Generic inputs |
| R029 | Manual connection checklist | Docs | Exact user-owned steps |
| R030 | V2 arbitrary-repo path | Architecture | Adapter/onboarding design |
