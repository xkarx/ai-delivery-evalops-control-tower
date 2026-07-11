---
name: rubric-authoring
description: "Author measurable rubrics for semantic and human evaluation with score anchors and escalation rules. Use when EvalOps needs consistent judgments, calibration, and criterion-level bias analysis."
---

# Rubric authoring

## Purpose
Define criteria that independent judges and human reviewers can apply consistently.

## Preconditions and inputs
Require eval objective, audience, failure taxonomy, examples, release impact, and target score range.

## Required context and allowed tools
Read relevant requirements, cases, prior disagreements, and gate policy. Use structured authoring, schema validation, and trace recording.

## Procedure
1. Separate criteria such as grounding, correctness, completeness, safety, and clarity.
2. Define observable score anchors and disqualifying critical failures.
3. Add ambiguity, not-applicable, evidence, and escalation instructions.
4. Trial against contrasting examples and revise overlapping or subjective criteria.

## Output schema and evidence
Return `{version, criteria, weights, anchors, criticalRules, reviewInstructions}` linked to requirements and dataset.

## Human approval
Require rubric-owner approval before using a new version in a release gate.

## Failure and evaluation
Stop on contradictory weights or non-observable anchors. Evaluate inter-reviewer agreement, false pass/block, criterion bias, ambiguity, and review time.

## Example
Author a 100-point PM-grounding rubric with a critical unsupported-claim rule.
