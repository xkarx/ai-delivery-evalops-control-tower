---
name: dependency-mapping
description: "Build and validate ticket, service, approval, and provider dependency graphs. Use when TPM, engineering, release, or incident work needs ordering, parallel paths, critical-path risks, or cycle detection."
---

# Dependency mapping

## Purpose
Make execution order, parallelism, blockers, and readiness dependencies explicit.

## Preconditions and inputs
Require stable entity IDs, dependency candidates, ownership, external prerequisites, and target milestone.

## Required context and allowed tools
Read PRD, architecture, connector health, and current ticket state. Use graph traversal, schema validation, and lineage recording.

## Procedure
1. Normalize each dependency as predecessor, successor, type, and reason.
2. Reject self-links, missing entities, and cycles.
3. Identify dependency-free workstreams, joins, critical path, and external gates.
4. Attach owners, risk, status, and evidence to each blocking edge.

## Output schema and evidence
Return `{nodes, edges, roots, joins, criticalPath, blockers}` with stable IDs and reasons.

## Human approval
Request review before changing committed ownership, milestone, or external-provider prerequisites.

## Failure and evaluation
Stop on cycles or unresolved required nodes. Evaluate acyclicity, completeness, parallel-path accuracy, blocker freshness, and lineage validity.

## Example
Show two implementation roots converging on one preview-readiness ticket.
