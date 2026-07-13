# Live Verification Report

Verified on 2026-07-12 against the canonical hosted application:

**https://ai-delivery-evalops-control-tower-c.vercel.app**

This report records observed production evidence. It does not treat configured credentials, static fixtures, or local checks as proof of a live provider action.

## How to read the cockpit and this report

The `/demo` cockpit is the authoritative presentation for one signed session. A provider link is attached to the stage that caused it: an `artifactUrl` is the exact ticket/message/PR/preview/event/deployment record, while a `dashboardUrl` is a broader provider view. A health probe, configured secret, or “live” runtime label is not an action receipt. When no exact link exists, the UI should say pending, unavailable, partial, or deterministic fallback.

The product intentionally has a mixed boundary. Company/customer inputs are synthetic and privacy-safe. Showcase selects one feature track; Full Verification selects two tracks plus the measured correction path. Provider liveness is independent of that profile: only model calls, writes, previews, evaluations, deployments, events, and incident follow-up that returned external records are live. Any fallback remains explicitly labelled.

Agent-output evaluations and preview evaluations are separate evidence. Agent-output evaluations grade the structured role response for grounding, scope, and provenance. Preview evaluations run browser/accessibility checks against the exact built commit and preview URL. Both remain subordinate to the feature and release human gates.

Full Verification is asynchronous: worker start can take up to 15 seconds, analysis and provider synchronization commonly take 30–90 seconds each, previews and browser evaluations commonly take 1–3 minutes each, and correction/rebuild/rerun commonly takes 2–5 minutes. Human approval phases have no automatic timeout. These are operator estimates, not additional live records.

## Guided workflow recovery deployment — 2026-07-12

| Record | Observed value |
|---|---|
| Baseline tag | `v1-pre-guided-recovery-20260712` at `2e45e3c` |
| Recovery commits | `2d5c0f5371528369bb68da916246321fea7c028a`, `48213a8a41f352a58b8e6409c4b19eeb0d3ee867`, `b844ec8c997efbf74441b78360aec7def4016441` |
| Vercel deployment | `dpl_ABGj6jNkGs5QVsuCMhSTMcypG1bm` · READY |
| Deployment URL | `https://ai-delivery-evalops-control-tower-control-tower-ji65mom3w.vercel.app` |
| Canonical route check | 14/14 application routes returned HTTP 200 |
| Existing preview bypass | HTTP 200 DailyCart product shell; Vercel login HTML was not returned |
| Current durable phase | `awaiting_feature_approval` |
| Available action | `approve_feature` |
| Recovered action | `ACTION-846FDD6CE74E` · one attempt · `waiting_human` |
| Active session | `SESSION-1783897727709` |
| Active workflow | `WORKFLOW-1783897744823044D` |
| Visible execution stages | Context Retrieval, Research, Support Insight, Analytics, PM, UX, Engineering Feasibility, EvalOps |
| Refresh proof | Canonical `/runs` restored the same action, 100% progress, stage history, recommendations, and approval CTA after a full reload |

The previously stuck zero-attempt action was repaired in place. It completed opportunity analysis and initially stopped at the required human feature gate. The operator later approved those feature tracks; the resulting delivery and preview records are documented below. Release approval remains an un-crossed human boundary.

### Current session delivery and preview proof

The operator approved the feature tracks. The first delivery action reached READY previews but failed when GitHub rejected the Actions-specific `workflow_dispatch` operation with HTTP 403. The application now falls back to `repository_dispatch`, which uses the token's existing repository-write permission. The retry resumed at preview evaluation rather than duplicating planning, Linear tickets, Slack handoffs, pull requests, or Vercel builds.

| Record | Verified value |
|---|---|
| Retry action | `ACTION-7E896E40F76A` |
| Current phase | `awaiting_release_approval` |
| Linear records | `DAI-25` through `DAI-32` |
| Feature pull requests | [PR #6](https://github.com/xkarx/ai-delivery-evalops-control-tower/pull/6), [PR #7](https://github.com/xkarx/ai-delivery-evalops-control-tower/pull/7) |
| Initial FEAT-0001 eval | Focus-restoration failure with captured browser trace; release blocked |
| Correction | `10ec2f211245a190d957eeaabfb7698739fa81dd` |
| Corrected FEAT-0001 eval | [GitHub run 29216966634](https://github.com/xkarx/ai-delivery-evalops-control-tower/actions/runs/29216966634) · 100/100 |
| Current FEAT-0002 eval | [GitHub run 29217001688](https://github.com/xkarx/ai-delivery-evalops-control-tower/actions/runs/29217001688) · 100/100 |
| Human boundary | Release approval is enabled but has not been granted |

The action heartbeat is updated while GitHub browser runs are queued or in progress. Long-running provider work is no longer mistaken for a stalled action, and settled actions do not retain stale failure banners.

## Production workflow

| Record | Verified value |
|---|---|
| Operator action | `ACTION-2B87228C` |
| Demo session | `SESSION-1783851681641` |
| Workflow | `WORKFLOW-1783851681641` |
| Context pack | `CONTEXT-9001` |
| Feature batch | `BATCH-0101` |
| Model path | OpenAI-compatible live model through the configured gateway |
| Agent runs | `RUN-0100`, `RUN-0110`, `RUN-0111`, `RUN-0101`, `RUN-0102`, `RUN-0103` |
| Feature approval | `APR-0101` |
| Release approval | `APR-0102` |
| Traffic run | `TRAFFIC-20260712-0001` |
| Incident | `INC-0002` |
| Regression case | `EVALCASE-9002` |
| Replay archive | `REPLAY-2026-07-12T19-21-50-372Z` |

The live model produced evidence-grounded PM, UX, and engineering-feasibility outputs. Structural evaluations scored 100 and the configured semantic judge scored 92. State survived refresh and replay created a new clean active state while retaining the archived audit record.

## GitHub, previews, checks, and production

| Track | Pull request | Final commit | Passing preview | Production record |
|---|---|---|---|---|
| Checkout recovery guidance | [PR #3](https://github.com/xkarx/ai-delivery-evalops-control-tower/pull/3) | `68304d804a283b9b476ac4161b1728fab9ccea44` | [Preview](https://ai-delivery-evalops-control-tower-control-tower-142atidwh.vercel.app) | [Deployment](https://ai-delivery-evalops-control-tower-control-tower-5e6mur18b.vercel.app) · `DEP-0101` |
| Persistent cart recovery | [PR #4](https://github.com/xkarx/ai-delivery-evalops-control-tower/pull/4) | `8ded3a26f3d51096b9092dacb70f6693ed22e789` | [Preview](https://ai-delivery-evalops-control-tower-control-tower-dlp6r5g9l.vercel.app) | [Deployment](https://ai-delivery-evalops-control-tower-control-tower-lekslktcn.vercel.app) · `DEP-0102` |

Both pull requests completed GitHub quality, browser, and Vercel checks. The workflow recorded a 75-point blocked first version for FEAT-0001, followed by a corrected 100-point preview. FEAT-0002 passed at 100. Release approval was recorded only after the current checks and preview gates passed.

An independent remote Playwright run against the deployed product passed three behavioral checks: product/flag rendering, keyboard-focus restoration, and cart persistence across refresh.

## Provider evidence

| Provider | Live evidence |
|---|---|
| Slack | Agent handoffs, release, and incident messages were written to configured channel `C0BGNTCJBKL`; [release message](https://app.slack.com/client/T00000000/C0BGNTCJBKL/1783883730256339), [incident message](https://app.slack.com/client/T00000000/C0BGNTCJBKL/1783884013787809) |
| Linear | Project issues DAI-10 through DAI-17 reached Done; incident follow-up [DAI-18](https://linear.app/dailycart/issue/DAI-18/sev-3-recovered-checkout-event-duplicated-after-mobile-retry) was created |
| GitHub | Two branches, functional commits, pull requests, checks, and merge commits were verified |
| Vercel | Two passing preview deployments and two READY production deployment records were verified |
| Supabase | Durable session, workflow, run, approval, preview, deployment, incident, and replay records were verified |
| Langfuse | [Workflow trace](https://us.cloud.langfuse.com/project/cmrg2filf07tzad0dz3hwdbbi/traces/dailycart-workflow-v1) with linked observations and scores |
| PostHog | Live traffic path recorded 49 events for 12 users, including seven feature exposures and four completed checkouts, in the configured project |
| Inngest | [Event `01KXBX209NPKG5KYGKKXZTWTZH`](https://app.inngest.com/env/production/events/01KXBX209NPKG5KYGKKXZTWTZH) produced completed run `01KXBX20PX2RT49S792KEPTS6Q` |
| DailyCart product | Service-authorized traffic completed successfully and durable event counts were returned before success |

## Application and security checks

- All 14 application routes returned HTTP 200, including `/company`.
- Anonymous workflow start returned HTTP 401.
- The signed operator session authorized live writes without exposing the passcode or provider secrets.
- Final local release checks passed: lint, type checking, 50 unit tests, production build, browser suite, remote preview suite, and secret scan.
- Responsive browser coverage exercised 390, 768, 1024, 1280, 1440, and 1920 pixel widths.

## Remaining strict-acceptance gaps

1. **Distinct Slack channels are not yet configured.** Delivery, approval, alert, analytics, release, and incident writes are real, but they currently fall back to one configured Slack channel. Four-channel proof requires channel creation/membership and the corresponding deployment channel IDs.
2. **The main workflow is hybrid.** Durable action receipts, persisted transitions, and a completed Inngest function are real. Not every core phase is yet exclusively advanced by a background Inngest function.
3. **The deliberate blocked first preview is an orchestrated release-gate case.** The corrected deployed behavior has independent browser proof, but the original 75-point failure does not include a captured failing browser trace.

These limitations are displayed as limitations rather than converted into simulated success.

## Current limitations and non-claims

- This report proves the recorded sessions and provider IDs above; it does not prove a future run, a different workspace, or a newly configured channel.
- Distinct Slack channel routing remains the documented configuration gap; the observed messages used the configured default channel.
- The local DailyCart product/HTTP sidecar is the verified sample-product adapter target. The repository does not claim that Google's upstream Online Boutique multi-service deployment is already hosted or receiving traffic.
- The workflow includes durable execution and Inngest evidence, but the report should not be interpreted as proof that every phase is exclusively advanced by a background Inngest function.
- A passing agent-output score cannot substitute for a preview-target browser pass, and a passing preview cannot substitute for a human release approval.
