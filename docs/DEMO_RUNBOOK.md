# V1 demo runbook

The demo supports both credential-free deterministic adapters and configured live provider adapters.

```bash
corepack pnpm install
corepack pnpm demo
corepack pnpm dev
```

Open `http://localhost:3000`. The control tower reads `artifacts/demo-state.json` when present and falls back to the checked-in schema-valid fixture on a clean clone. The fixed Demo Guide on the right explains the current phase, what was triggered, evidence used, provider records, and the next human action.

The CLI command `corepack pnpm demo` is a deterministic fixture generator and verifier; it exits after writing local artifacts. It is useful for CI and a fast rehearsal, but it is not the session-scoped `/demo` cockpit and does not create live provider records. Use the cockpit for interactive approvals, waits, retries, previews, and deployment evidence.

## Choose the walkthrough mode

Start at `http://localhost:3000/demo` rather than a deep link. The cockpit owns a signed, session-scoped workflow and survives refreshes and a second tab.

| Mode | Configuration | What is real | Expected use |
|---|---|---|---|
| Showcase | One feature track; target 8–12 minutes | The same executable workflow with one build and one preview; provider actions follow `INTEGRATION_MODE` | Fast, non-technical presentation |
| Full Verification | Two feature tracks; target 18–25 minutes | Parallel builds plus the measured failure, correction, and rerun; provider actions follow `INTEGRATION_MODE` | Complete technical and acceptance proof |

The cockpit persists the selected run profile per session. Provider liveness is separate: the UI's `Deterministic fallback` or `Live provider path` labels and each record's source mode are authoritative. Synthetic company inputs remain synthetic in both modes.

## Realistic timing

Both profiles can wait on real providers when `INTEGRATION_MODE=live`. Showcase is shorter because it runs one track; Full Verification runs two tracks and the correction sequence. Use the cockpit heartbeat and phase estimate rather than repeatedly clicking:

- worker start: up to 15 seconds;
- context and agent analysis: roughly 30–90 seconds;
- plan and provider synchronization: roughly 10–90 seconds;
- GitHub/Vercel preview builds: roughly 1–3 minutes;
- preview browser evaluation: roughly 1–3 minutes per preview;
- measured correction and rebuild: roughly 2–5 minutes;
- feature and release approval: waits indefinitely for the operator.

If a provider is queued, the cockpit shows `Waiting for ...`; if the heartbeat expires, it starts the same action's recovery worker and reports the exact error instead of pretending it completed. Do not start a second session to “speed it up.”

The scripted run performs the complete vertical slice:

1. Generate DailyCart company data with `SYNTHETIC_DATA_SEED`.
2. Analyze evidence and rank opportunities at runtime from the versioned company context pack.
3. Run explicit UX and engineering-feasibility reviews, then create a PM-owned implementation brief and human-gated feature decision.
4. Delivery planning turns the approved brief into dependencies, readiness checks, owners, milestones, and tracker tickets.
5. Execute one engineering workstream in Showcase or two independent workstreams in Full Verification.
6. Run exact preview checks; Full Verification includes a critical regression that blocks release.
7. In Full Verification, apply the correction and rerun; the passing campaign unlocks the release.
8. Generate capped traffic with persistent `CUS-*` identifiers and checkout recovery telemetry.
9. Convert a simulated incident into a regression case and retain the lineage edge.
10. Sync Linear, Slack, Langfuse, Inngest, Supabase, GitHub, Vercel, and PostHog wherever live adapters are configured; otherwise preserve an explicit fallback or unavailable state.

## Live operator demo

The deployed app deliberately separates synthetic inputs from live delivery actions:

- Company context and DailyCart customer records are synthetic and privacy-safe.
- Agent/skill runs, evaluations, approvals, ticket mutations, Slack messages, GitHub/Vercel actions, and provider telemetry are live only when `INTEGRATION_MODE=live` and the corresponding provider is configured.
- A live write requires the operator passcode. Unlock it from the Demo Guide; an anonymous visitor can browse but cannot spend shared API credits or create external records.
- The Integrations page is the source of truth for mode, configuration, read health, write capability, last action, timestamp, and external link. A `DETERMINISTIC FALLBACK` label is not a live provider success.

Recommended sequence for a live run:

1. Open **/demo**, unlock as operator, and start a clean session.
2. Open **Company data** from the stage rail and open an evidence record so the citations are visible.
3. Approve both ranked feature tracks after reading PM, UX, and feasibility summaries.
4. Build the two previews, inspect their GitHub/Vercel links, and run preview evals. A critical failure intentionally blocks release.
5. After the corrected campaign passes, approve release, deploy both tracks, and sync delivery records.
6. Open **Agent runs**, **Eval campaigns**, **Releases**, **Integrations**, **Product**, and **Analytics** to follow the same IDs across the UI and providers.
7. In Slack, use `/dailycart status`, `/dailycart ask <question>`, `/dailycart add-feature <description>`, `/dailycart approve feature <feature-id>`, `/dailycart approve release <feature-id>`, `/dailycart create-ticket <description>`, `/dailycart replay`, and `/dailycart reset`.

The feature gate and release gate are human boundaries. The PM, UX, feasibility, TPM, Engineering, EvalOps, and Release roles can prepare evidence and request a decision; they cannot approve their own consequential transition. A blocked preview eval requires correction and rerun before the release action becomes available.

Agent-output evaluation and preview evaluation are separate: the former grades a role's structured output and provenance, while the latter exercises the deployed preview at the exact commit. Inspect both before release.

Slack uses one app/bot identity with logical agent personas. Configure distinct channel IDs for `SLACK_DELIVERY_CHANNEL`, `SLACK_APPROVALS_CHANNEL`, `SLACK_ALERTS_CHANNEL`, and `SLACK_ANALYTICS_CHANNEL`; the default channel remains the safe fallback. If a channel ID is absent or the bot is not invited, that fan-out is reported as unavailable rather than fabricated.

Use **Replay run** to archive the current workflow artifacts and reset the demo state without deleting external audit records. Use **Eval workbench** to author/version a case, run it against the current outputs, and inspect the measured gate.

Use `corepack pnpm demo:reset` to clear runtime artifacts and regenerate only the synthetic company. `corepack pnpm demo:verify` validates the final state and fails if the blocked and passing campaigns or two engineering runs are absent.

Every provider action carries its own live, fallback, pending, partial, or unavailable status. A configured runtime alone is never treated as proof of an external action.
