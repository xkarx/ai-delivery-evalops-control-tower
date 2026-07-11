---
name: eval-case-generation
description: "Generate and version deterministic, semantic, safety, trajectory, or regression eval cases from requirements and failures. Use when EvalOps needs executable cases with expected values, criticality, provenance, and stable IDs."
---

# Eval-case generation

## Purpose
Convert requirements and observed failures into independent, executable, versioned cases.

## Preconditions and inputs
Require source requirement/evidence/incident IDs, dataset version, expected behavior, category, and criticality policy.

## Required context and allowed tools
Read schemas, failure taxonomy, existing dataset, and release policy. Use case validator, deterministic ID allocator, dataset store, and lineage recorder.

## Procedure
1. Identify one observable behavior and its provenance.
2. Choose deterministic grader whenever possible; reserve semantic judging for qualitative criteria.
3. Define input, expected output, criticality, and a correction-resistant failure fixture.
4. Deduplicate, allocate `EVALCASE-*`, bump dataset version, validate, and link source entity.

## Output schema and evidence
Return `EvalCase`, dataset version/checksum, source IDs, and lineage; label synthetic, simulated, mocked, or live accurately.

## Human approval
Require domain review for safety-critical expected labels and policy-criticality changes.

## Failure and evaluation
Stop on unexecutable expectations or missing provenance. Evaluate determinism, reproducibility, independence, criticality, duplicate rate, and failure detection.

## Example
Convert a checkout retry incident into a critical boolean regression case.
