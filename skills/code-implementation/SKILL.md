---
name: code-implementation
description: "Implement an approved engineering ticket in an isolated branch or worktree and execute measured verification. Use when an engineering agent must make real, scoped code changes with tests and traceable outcomes."
---

# Code implementation

## Purpose
Produce reviewable code and measured checks for exactly one approved workstream.

## Preconditions and inputs
Require ticket, implementation plan, clean isolation target, repository instructions, and acceptance tests.

## Required context and allowed tools
Read relevant code and tests. Use isolated git work, patch editing, build/lint/type/test runners, secret scanning, and trace recording.

## Procedure
1. Create or verify an isolated branch/worktree linked to the ticket.
2. Implement the smallest coherent change and add regression coverage.
3. Run all scoped checks and capture command, exit status, duration, and relevant output.
4. Review diff for scope, secrets, dependency risk, and requirement coverage.

## Output schema and evidence
Return code diff references, measured checks, commit SHA when created, failures, retries, and `AgentRun` lineage.

## Human approval
Do not self-approve scope expansion, destructive operations, secrets, protected-branch writes, or releases.

## Failure and evaluation
Stop on critical safety or secret failures. Evaluate build/tests, regression safety, scope, dependency safety, acceptance coverage, cost, and latency.

## Example
Implement and test one ticket on `agent/tkt-0001-experience`.
