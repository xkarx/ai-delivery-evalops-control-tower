---
name: prd-generation
description: "Generate an evidence-preserving product requirements document for an approved feature. Use when PM or TPM work needs scoped objectives, metrics, user stories, non-goals, risks, and testable acceptance criteria."
---

# PRD generation

## Purpose
Translate an approved problem and hypothesis into a reviewable, testable specification.

## Preconditions and inputs
Require approved feature and decision IDs, evidence citations, strategy, constraints, and metric definitions.

## Required context and allowed tools
Read the decision, evidence, current behavior, and requirement schemas. Use document generation, validation, and lineage recording.

## Procedure
1. Preserve the approved problem, hypothesis, and evidence IDs.
2. Define objective, users, in-scope behavior, and explicit non-goals.
3. Define measurable outcomes, instrumentation, risks, and open questions.
4. Write observable acceptance criteria and link the PRD to feature and decision.

## Output schema and evidence
Return `ProductRequirementDocument` with stable `PRD-*` ID, feature ID, citations, scope, metrics, and acceptance criteria.

## Human approval
Require approval for material scope changes; do not use PRD generation to bypass feature approval.

## Failure and evaluation
Stop if approval or citations are missing. Evaluate required sections, evidence continuity, metric measurability, scope clarity, and criterion testability.

## Example
Create a V1 PRD from `FEAT-0001` and its approved evidence set.
