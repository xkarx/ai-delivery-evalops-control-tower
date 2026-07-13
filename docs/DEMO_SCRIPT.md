# Demo Script

Start at `/demo`. Pick one mode before narrating:

- **Showcase:** one feature, one preview, target 8–12 minutes. Say “company inputs are synthetic; each provider card tells us whether the delivery action is live or a deterministic fallback.”
- **Full Verification:** two features plus a measured failure/correction/rerun, target 18–25 minutes. Use it for the complete technical proof.

## The 10–15 minute showcase

1. Start a clean session and point out the boundary: synthetic company inputs → executed delivery actions.
2. Open **Company data** and show one interview, support record, and analytics signal with IDs.
3. Return to the cockpit and run analysis. Wait for the phase to change; do not click again.
4. Show the ranked opportunities, PM-owned brief, UX/feasibility findings, skill/version, context pack, and agent-output evals.
5. Stop at the feature approval gate. Explain that a role cannot approve its own consequential transition.
6. Approve the proposed feature scope, then show the delivery roadmap, owners, dependencies, and ticket links.
7. Show the engineering workstream(s) and provider cards. Call each action live only when its exact external record is present.
8. In Full Verification, show the intentional blocked preview evaluation, correction, and rerun. Explain that this is a browser check against an exact preview, not an agent-answer score. In Showcase, show the shorter passing single-preview path.
9. Stop again for release approval. Inspect current previews, checks, evals, and warnings before approving.
10. Finish on **Delivery report**, **Analytics**, **Incidents**, and **Lineage**. Explain that Replay archives this session and starts clean without deleting external audit records.

## The 18–25 minute full-verification walkthrough

Use the same script, but leave time for provider work:

- agent analysis: about 30–90 seconds;
- Linear/Slack/Langfuse/Supabase/Inngest synchronization: about 30–90 seconds;
- each GitHub/Vercel preview: about 1–3 minutes;
- each remote preview evaluation: about 1–3 minutes;
- correction/rebuild/rerun: about 2–5 minutes.

Narrate the heartbeat and phase estimate while waiting. Open provider cards only after an exact external ID/link appears. A health card is a read probe; it is not proof that a write, preview, or deployment completed. If a provider rejects a write, keep the partial result visible and follow the specific remediation.

## Close with the mental model

The flow is `context → evidence → PM brief → UX/feasibility → human feature approval → TPM plan → parallel engineering → exact preview eval → human release approval → deployment → product outcomes → incident/regression`. Agent-output evaluations answer “was the role's answer grounded and complete?” Preview evaluations answer “does this exact build behave correctly?” Both are required, and neither replaces the human gates.
