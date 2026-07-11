# EvalOps

## Entities

Eval request, campaign, dataset/version, case, rubric, grader, run, score, human judgment, calibration record, failure category, and release gate.

## Deterministic graders

- Schema and evidence-ID validity
- Required sections
- Build, lint, type checks
- Unit, integration, and Playwright tests
- Changed-file scope
- Secret scanning
- Dependency audit
- Tool-use policy

## Semantic graders

- Evidence grounding
- Problem understanding
- Recommendation quality
- PRD clarity
- Acceptance criteria
- Requirement coverage
- User-facing response quality

## Human review

- Rubric score
- Pairwise preference
- Ambiguity flag
- Rationale
- Escalation

## Calibration

Track agreement, false pass, false block, criterion-level bias, reviewer disagreement, and review time.

## Release gate example

- Critical deterministic checks pass
- No critical safety failure
- Weighted score at or above 85
- Required human approval present
- Regression delta within policy

Thresholds must be configurable and visible.
