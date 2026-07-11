---
name: support-ticket-clustering
description: "Cluster support tickets into evidence-linked problem themes, severity patterns, and representative cases. Use when PM or incident analysis needs recurring support pain separated from duplicates and noise."
---

# Support-ticket clustering

## Purpose
Turn support records into transparent, reproducible problem clusters.

## Preconditions and inputs
Require unique ticket/evidence IDs, timestamps, severity, customer linkage where allowed, text, and source labels.

## Required context and allowed tools
Read taxonomy, product areas, releases, and incident history. Use local clustering, schema validation, and trace tools; keep provider writes disabled.

## Procedure
1. Normalize text without deleting negation or failure details.
2. Deduplicate exact and near-duplicate records while retaining counts.
3. Cluster by derived terms and product context, not fixed recommendations.
4. Score recurrence, severity, breadth, and recency; retain outliers.

## Output schema and evidence
Return `{clusters, members, outliers, scoreBreakdown}` with every member ID and a representative evidence citation.

## Human approval
Require review before merging ambiguous clusters or escalating customer-impact claims.

## Failure and evaluation
Stop on invalid IDs or unusable text. Evaluate determinism, cluster purity, duplicate handling, outlier retention, and citation completeness.

## Example
Cluster thirty tickets and show which evidence supports each recurring checkout issue.
