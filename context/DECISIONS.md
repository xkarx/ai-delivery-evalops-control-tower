# Decisions

## Confirmed

- Product: AI Product Delivery and EvalOps Control Tower
- Default sample-product candidate: Google Online Boutique
- Fictional company: provisional name DailyCart
- GitHub is the engineering system of record
- Slack is the main interaction and approval surface
- Linear is the product/project tracker, with GitHub Issues fallback
- Supabase stores shared state and lineage
- Langfuse provides traces and eval infrastructure
- PostHog provides product analytics
- GitHub Actions provides checks and release gates
- A custom control tower joins the complete lifecycle
- Agents use reusable skills
- Demo mode and live mode are both required
- V1 and V2 are the only major release stages

## Provisional

- Next.js, TypeScript, Tailwind, and shadcn/ui
- pnpm and Turborepo
- Inngest for V1 workflows, behind an adapter
- Vercel for the control tower
- Sample-product cloud target selected after cost and feasibility validation

## Open decisions that must be documented

- Final cloud target for Google Online Boutique
- Whether live V1 ticketing starts with Linear or GitHub Issues
- Exact reviewer UI boundary between the control tower and Langfuse
- Model choices and cost caps
- Which open-source components are copied, adapted, or only referenced
