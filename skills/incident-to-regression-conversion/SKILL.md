---
name: incident-to-regression-conversion
description: "Convert a production incident and root cause into a linked critical regression case and follow-up work. Use when incident mitigation must become durable EvalOps coverage before closure."
---

# Incident-to-regression conversion

## Purpose
Make a production failure reproducible, versioned, release-blocking, and traceable to its incident.

## Preconditions and inputs
Require incident ID, severity, affected feature/deployment, observed failure, root cause, mitigation, and dataset target.

## Required context and allowed tools
Read incident timeline, traces, release, existing regressions, and failure taxonomy. Use dataset store, eval runner, issue adapter, and lineage recorder.

## Procedure
1. Validate incident/root-cause evidence and reproduce the failing behavior safely.
2. Define the corrected expected behavior and prefer a deterministic grader.
3. Create a critical `EVALCASE-*`, version dataset, and add `INC-* creates_regression_case EVALCASE-*` lineage.
4. Execute the case against failing and corrected fixtures; create owned follow-up work and closure criteria.

## Output schema and evidence
Return updated `Incident`, regression `EvalCase`, dataset version, lineage edge, measured results, and action items.

## Human approval
Require incident owner review for root cause, destructive reproduction, rollback, external communication, and closure.

## Failure and evaluation
Do not close an irreproducible critical incident silently. Evaluate reproduction, expected-label validity, stable linkage, failure detection, corrected pass, and action ownership.

## Example
Link `INC-0002` to a critical checkout-retry case in dataset version 1.1.0.
