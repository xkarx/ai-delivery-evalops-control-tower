# DailyCart scenario manifest

> **Synthetic demo data.** Scenario settings generate fictional evidence and analytics. They never change external systems.

The committed corpus uses seed `20250301` and scenario `checkout-friction`. Generation records the exact seed, scenario, deterministic clock, counts, file inventory, and signal weights in `generated/manifest.json`.

## Generate and validate

```bash
npm run generate:company -- --seed 20250301 --scenario checkout-friction
npm run validate:data
```

Configuration may also come from `COMPANY_SEED`, `COMPANY_SCENARIO`, and `COMPANY_OUTPUT_DIR`. CLI arguments take precedence. Generation validates by default; `--no-validate` is only for inspecting deliberately broken output. List available scenarios with:

```bash
npm run generate:company -- --list-scenarios
```

## Available scenarios

| ID | Evidence shape | Analytics shape | Deliberate ambiguity |
|---|---|---|---|
| `checkout-friction` | Interrupted cart and checkout signals are most frequent. | Lower checkout-start to completion probability. | A retry-path incident inflates some reports; several valuable customers report no impact. |
| `search-relevance` | Descriptive and misspelled-query signals are most frequent. | More search use and healthier checkout completion. | A broad-query acquisition campaign may not represent durable demand. |
| `balanced-signals` | The five themes have similar signal volume. | Middle-range search and checkout behavior. | Cohort sizes and seasonality make multiple differences inconclusive. |

The generator does not encode a recommended feature. It creates candidate problems, linked evidence, strategy, goals, uncertainty, and historical context for a PM agent to analyze.

## Reproducibility contract

- Same seed + same scenario + same generator version produces byte-identical files.
- A different scenario keeps stable entity IDs but changes evidence distribution, wording, and analytics.
- A different seed keeps schemas and minimum counts but changes deterministic cohort assignments and event paths.
- Synthetic timestamps come from a fixed 2024-01-01 through 2025-04-01 clock; wall-clock time is never written.
- Generation replaces only the selected output directory and then validates every cross-file reference.

## Minimum committed corpus

The validator enforces 3 quarterly goals, 5 personas, 50 customers, 8 interviews, 10 or more survey responses, 30 support tickets, 20 feature requests, 15 bugs, 8 Slack threads, 25 backlog items, 5 decisions, 5 releases, 3 incidents with postmortems, 3 experiments, and at least 30 eval cases. Narrative Markdown, entity JSON, analytics CSV, and eval JSONL must all be present and clearly labeled.
