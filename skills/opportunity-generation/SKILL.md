---
name: opportunity-generation
description: "Generate multiple product opportunities from supplied research, support, analytics, and incident evidence. Use when a PM agent must brainstorm dynamically and cite the evidence that created each candidate."
---

# Opportunity generation

## Purpose
Create distinct, evidence-grounded problem opportunities without hardcoding a feature.

## Preconditions and inputs
Require validated evidence, strategy/goals, existing features, and maximum candidate count.

## Required context and allowed tools
Read evidence and backlog only. Use interview synthesis, support clustering, analytics analysis, schema validation, and trace recording.

## Procedure
1. Derive themes from input tags and text.
2. Generate problem statements and hypotheses for recurring themes.
3. Remove duplicates against existing and newly generated candidates.
4. Attach valid evidence IDs, counter-signals, confidence, metrics, and source labels.

## Output schema and evidence
Return candidate `Feature[]` plus citations and derivation metadata. Never cite an ID outside the supplied evidence set.

## Human approval
Do not advance a candidate to delivery; send ranked candidates to the feature approval gate.

## Failure and evaluation
Stop when no evidence-backed theme exists. Evaluate scenario-change behavior, citation validity, novelty, unsupported claims, and source labeling.

## Example
Generate candidates from a checkout-heavy scenario, then verify a search-heavy scenario changes the output.
