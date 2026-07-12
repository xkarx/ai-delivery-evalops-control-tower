# Live Verification Report

Verified on 2026-07-12 against the canonical hosted application:

**https://ai-delivery-evalops-control-tower-c.vercel.app**

This report records observed production evidence. It does not treat configured credentials, static fixtures, or local checks as proof of a live provider action.

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
| Langfuse | [Workflow trace](https://us.cloud.langfuse.com/traces/dailycart-workflow-v1) with linked observations and scores |
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
