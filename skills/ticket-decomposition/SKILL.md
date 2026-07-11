---
name: ticket-decomposition
description: "Decompose an approved PRD into small, testable tickets and at least two independently executable workstreams. Use when TPM planning needs ownership, acceptance criteria, integration work, and stable feature lineage."
---

# Ticket decomposition

## Purpose
Create implementation-sized work with complete PRD coverage and minimal overlap.

## Preconditions and inputs
Require approved PRD, repository boundaries, available workstreams, delivery policy, and ticket ID allocator.

## Required context and allowed tools
Read architecture, code ownership, tests, and existing backlog. Use schema validation, issue-tracker adapter in dry-run/mock mode, and lineage recorder.

## Procedure
1. Map each PRD criterion to one or more verifiable tasks.
2. Separate core behavior and reliability/telemetry into dependency-free workstreams where safe.
3. Add a dependent integration/readiness ticket.
4. Assign owner/workstream, acceptance criteria, scope, and stable IDs; check overlap and omissions.

## Output schema and evidence
Return `Ticket[]` plus a requirement-to-ticket coverage map; each ticket must link to its feature and PRD.

## Human approval
Require approval before live tracker writes when connector policy requires it.

## Failure and evaluation
Stop on uncovered critical criteria or circular decomposition. Evaluate completeness, independence, ticket size, overlap, stable IDs, and acceptance quality.

## Example
Produce experience and reliability tickets in parallel plus a dependent integration ticket.
