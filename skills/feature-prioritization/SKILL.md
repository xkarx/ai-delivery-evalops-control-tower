---
name: feature-prioritization
description: "Rank evidence-linked feature candidates with a transparent, scenario-sensitive score and uncertainty. Use when PM work needs a recommendation that can be audited and changes when the underlying evidence changes."
---

# Feature prioritization

## Purpose
Rank candidates by measured evidence strength, reach, severity, strategy, feasibility, and confidence.

## Preconditions and inputs
Require candidate features, their citations, goals, duplicate set, scoring weights, and known constraints.

## Required context and allowed tools
Read evidence and capacity constraints. Use deterministic scoring, schema validation, and trace recording.

## Procedure
1. Reject candidates with invalid or empty citations.
2. Calculate each criterion from inputs and expose the breakdown.
3. Apply uncertainty penalties and record counter-signals.
4. Sort deterministically, explain ties, and mark only the top candidate awaiting approval.

## Output schema and evidence
Return ranked features with scores, confidence, criterion values, rationale, and cited evidence IDs.

## Human approval
Treat the recommendation as advisory; require an independent human decision and rationale.

## Failure and evaluation
Stop on missing weights or provenance. Evaluate ranking determinism, scenario sensitivity, score bounds, grounding, and duplicate avoidance.

## Example
Rank checkout and search opportunities and expose why one leads under the current evidence.
