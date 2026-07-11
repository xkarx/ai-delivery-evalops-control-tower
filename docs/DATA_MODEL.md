# Data Model and Lineage

## Core entities

Organization, Product, Customer, Persona, Evidence, ResearchSession, SupportTicket, AnalyticsSignal, Feature, Decision, PRD, Project, Ticket, WorkflowRun, AgentRun, Approval, PullRequest, EvalCampaign, EvalCase, EvalResult, Deployment, Release, Incident, ActionItem, ExternalReference, and LineageEdge.

## Stable identifiers

Use prefixes such as `EVD`, `CUS`, `FEAT`, `DEC`, `TKT`, `RUN`, `EVAL`, `DEP`, and `INC`.

## Lineage edge

Each relationship stores source type and ID, relationship, target type and ID, timestamp, and metadata.

Examples:

- `EVD-0004 supports FEAT-0002`
- `FEAT-0002 approved_by DEC-0003`
- `FEAT-0002 implemented_by PR-42`
- `PR-42 evaluated_by EVAL-0091`
- `DEP-0005 releases FEAT-0002`
- `INC-0002 creates_regression_case EVALCASE-0041`

## External references

Store provider, workspace/repository, external ID, URL, sync status, last synchronization time, and normalized error state.
