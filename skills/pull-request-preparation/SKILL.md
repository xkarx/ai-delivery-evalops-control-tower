---
name: pull-request-preparation
description: "Prepare a traceable pull request from measured engineering work. Use when an engineering or release agent needs a clear summary, test evidence, risk notes, issue links, and mock-or-live code-host behavior."
---

# Pull-request preparation

## Purpose
Turn an isolated, tested workstream into a reviewable PR artifact without inventing checks.

## Preconditions and inputs
Require ticket/feature IDs, branch, diff, measured checks, commit SHA, connector mode, and risk notes.

## Required context and allowed tools
Read repository PR template and branch policy. Use git inspection, code-host adapter, secret scan, and lineage recorder.

## Procedure
1. Confirm diff scope and clean secret/dependency checks.
2. Summarize problem, approach, screenshots or behavior, tests, risks, and rollback.
3. Link feature, ticket, run, requirements, and eval expectations.
4. In mock mode record a clearly mocked PR; in live mode request approved adapter write and retain external URL.

## Output schema and evidence
Return `{pullRequestId, mode, branch, commitSha, title, body, checks, url, lineage}`.

## Human approval
Follow connector approval policy; never merge or promote a protected branch automatically.

## Failure and evaluation
Stop on failed required checks, dirty scope, missing lineage, or secrets. Evaluate summary accuracy, check provenance, link validity, and mode labeling.

## Example
Prepare a PR for `TKT-0001` with exact test commands and a mocked URL in demo mode.
