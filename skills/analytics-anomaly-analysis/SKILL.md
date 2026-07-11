---
name: analytics-anomaly-analysis
description: "Analyze product-event and funnel data for evidence-linked anomalies, segments, and plausible explanations. Use when PM, release, or incident work needs measured changes without confusing correlation with causation."
---

# Analytics anomaly analysis

## Purpose
Detect meaningful deviations and produce testable, carefully qualified explanations.

## Preconditions and inputs
Require event schema, time window, baseline, segment definitions, persistent IDs, scenario seed, and metric provenance.

## Required context and allowed tools
Read release/exposure windows and known incidents. Use read-only analytics adapters, deterministic calculations, and traces.

## Procedure
1. Validate event names, timestamps, denominators, and identity continuity.
2. Compare current and baseline funnels by relevant segments.
3. Quantify absolute and relative deltas with sample sizes.
4. Link anomalies to evidence IDs and list competing explanations and follow-up tests.

## Output schema and evidence
Return `{anomalies, segments, baselines, evidenceIds, caveats}` with query or dataset references and measured values.

## Human approval
Require review before declaring causality, changing traffic, or starting an experiment.

## Failure and evaluation
Stop on schema drift or invalid denominators. Evaluate reproducibility, arithmetic, segment leakage, caveats, and source linkage.

## Example
Explain a checkout conversion drop by device while preserving sample sizes and uncertainty.
