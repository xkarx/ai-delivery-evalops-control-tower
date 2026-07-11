---
name: interview-synthesis
description: "Synthesize validated customer interview transcripts into evidence-linked themes, tensions, and open questions. Use when PM work needs qualitative patterns without losing participant or evidence provenance."
---

# Interview synthesis

## Purpose
Derive recurring needs, counter-signals, and uncertainties from supplied interviews.

## Preconditions and inputs
Require transcript IDs, participant/persona IDs, timestamps, consent-safe text, and scenario/source labels.

## Required context and allowed tools
Read personas, goals, existing themes, and evidence schemas. Use read-only retrieval, structured parsing, and trace recording; do not contact participants.

## Procedure
1. Validate every transcript and stable ID.
2. Extract needs, behaviors, quotes as short paraphrases, sentiment, and uncertainty.
3. Cluster similar observations while retaining contradictory evidence.
4. Emit theme strength, source count, evidence IDs, and unanswered questions.

## Output schema and evidence
Return `{themes, contradictions, questions, evidenceIds}`. Every claim must cite an input `EVD-*` ID; label synthetic or live sources accurately.

## Human approval
Request review before treating sensitive or ambiguous findings as roadmap commitments.

## Failure and evaluation
Stop on missing provenance or invalid IDs. Evaluate citation validity, contradiction retention, duplicate rate, unsupported claims, and reviewer agreement.

## Example
Synthesize eight interview records into ranked needs with evidence IDs and confidence.
