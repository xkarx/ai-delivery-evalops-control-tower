---
name: implementation-planning
description: "Create an in-scope engineering plan from one approved ticket and repository evidence. Use before code changes to identify files, interfaces, tests, risks, dependencies, and exact verification commands."
---

# Implementation planning

## Purpose
Turn a ticket into a concrete, repository-aware execution plan without modifying unrelated scope.

## Preconditions and inputs
Require approved ticket, PRD, repository instructions, dependency status, and test commands.

## Required context and allowed tools
Read `AGENTS.md`, relevant code/tests, schemas, and neighboring patterns. Use read-only search, git inspection, and trace recording.

## Procedure
1. Validate approval, ticket lineage, and unblocked dependencies.
2. Inspect relevant files and existing tests before selecting an approach.
3. List intended file changes, interfaces, migration needs, and tests.
4. Record risks, rollback, security checks, and completion commands.

## Output schema and evidence
Return `{ticketId, files, steps, tests, risks, assumptions, rollback}` with repository paths and requirement IDs.

## Human approval
Escalate scope expansion, destructive changes, protected resources, or ambiguous acceptance criteria.

## Failure and evaluation
Stop on blocked dependencies or missing repository instructions. Evaluate scope adherence, feasibility, requirement coverage, test plan, and risk handling.

## Example
Plan isolated code and test changes for one `TKT-*` workstream.
