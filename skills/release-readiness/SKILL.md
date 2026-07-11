---
name: release-readiness
description: "Evaluate configurable release policy across checks, eval scores, regressions, safety, approval, preview, and rollback readiness. Use before any preview promotion or production deployment."
---

# Release readiness

## Purpose
Produce an auditable pass, block, or needs-review decision from executed evidence.

## Preconditions and inputs
Require candidate commit, check results, eval campaign, policy snapshot, approvals, preview health, and prior baseline score.

## Required context and allowed tools
Read critical case map, deployment policy, rollback plan, and connector health. Use read-only checks, eval store, approval store, and trace/lineage recording.

## Procedure
1. Verify every result belongs to the candidate and versioned dataset.
2. Block configured critical deterministic or safety failures.
3. Calculate weighted score and regression delta against visible policy.
4. Require designated human approval and healthy preview; emit exact blockers or readiness evidence.

## Output schema and evidence
Return `ReleaseGateDecision` with policy, score, reasons, critical case IDs, approval status, and links.

## Human approval
Never manufacture or self-supply required approval; deployment is prohibited unless `releaseAllowed` is true.

## Failure and evaluation
Fail closed on missing/stale evidence. Evaluate policy enforcement, threshold configurability, critical blocking, approval compliance, and decision reproducibility.

## Example
Block campaign 1 on a critical regression, then pass campaign 2 after correction and approval.
