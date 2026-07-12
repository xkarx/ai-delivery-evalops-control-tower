# V1 demo runbook

The demo is deterministic and requires no provider credentials.

```bash
corepack pnpm install
corepack pnpm demo
corepack pnpm dev
```

Open `http://localhost:3000`. The control tower reads `artifacts/demo-state.json` when present and falls back to the checked-in schema-valid fixture on a clean clone. The fixed Demo Guide on the right explains the current phase, what was triggered, evidence used, provider records, and the next human action.

The scripted run performs the complete vertical slice:

1. Generate DailyCart company data with `SYNTHETIC_DATA_SEED`.
2. Analyze evidence and rank opportunities at runtime from the versioned company context pack.
3. Run explicit UX and engineering-feasibility reviews, then create a PM-owned implementation brief and human-gated feature decision.
4. TPM consumes the approved brief to create dependencies, readiness checks, and tickets; it does not author the brief.
5. Execute two independent engineering workstreams and offer an isolated product preview build.
6. Run a critical regression campaign that blocks release.
7. Apply the correction and rerun; the passing campaign unlocks the release.
8. Generate capped traffic with persistent `CUS-*` identifiers and checkout recovery telemetry.
9. Convert a simulated incident into a regression case and retain the lineage edge.
10. Sync the Linear roadmap, Slack logical-agent handoff thread, Langfuse trace/score, Inngest event, and Supabase external references.

## Live operator demo

The deployed app deliberately separates synthetic inputs from live delivery actions:

- Company context and DailyCart customer records are synthetic and privacy-safe.
- Agent/skill runs, evaluations, approvals, ticket mutations, Slack messages, GitHub/Vercel actions, and provider telemetry are live only when `INTEGRATION_MODE=live` and the corresponding provider is configured.
- A live write requires the operator passcode. Unlock it from the Demo Guide; an anonymous visitor can browse but cannot spend shared API credits or create external records.
- The Integrations page is the source of truth for mode, configuration, read health, write capability, last action, timestamp, and external link. A `DETERMINISTIC FALLBACK` label is not a live provider success.

Recommended sequence for a live run:

1. Start from **Company data** and open an evidence record so the citations are visible.
2. Return to **Overview**, unlock as operator, and choose **Run demo**.
3. Approve both ranked feature tracks after reading PM, UX, and feasibility summaries.
4. Build the two previews, inspect their GitHub/Vercel links, and run preview evals. A critical failure intentionally blocks release.
5. After the corrected campaign passes, approve release, deploy both tracks, and sync delivery records.
6. Open **Agent runs**, **Eval campaigns**, **Releases**, **Integrations**, **Product**, and **Analytics** to follow the same IDs across the UI and providers.
7. In Slack, use `/dailycart status`, `/dailycart ask <question>`, `/dailycart add-feature <description>`, `/dailycart approve feature <feature-id>`, `/dailycart approve release <feature-id>`, `/dailycart create-ticket <description>`, `/dailycart replay`, and `/dailycart reset`.

Slack uses one app/bot identity with logical agent personas. Configure distinct channel IDs for `SLACK_DELIVERY_CHANNEL`, `SLACK_APPROVALS_CHANNEL`, `SLACK_ALERTS_CHANNEL`, and `SLACK_ANALYTICS_CHANNEL`; the default channel remains the safe fallback. If a channel ID is absent or the bot is not invited, that fan-out is reported as unavailable rather than fabricated.

Use **Replay run** to archive the current workflow artifacts and reset the demo state without deleting external audit records. Use **Eval workbench** to author/version a case, run it against the current outputs, and inspect the measured gate.

Use `corepack pnpm demo:reset` to clear runtime artifacts and regenerate only the synthetic company. `corepack pnpm demo:verify` validates the final state and fails if the blocked and passing campaigns or two engineering runs are absent.

Every provider action is labeled `mocked`, `simulated`, or `synthetic`. Connected mode is enabled only after the manual checklist is complete.
