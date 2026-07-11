# Agents and Skills

Agents are roles. Skills are reusable procedures.

Every agent definition includes mission, inputs, context, tools, allowed actions, approvals, output schema, retries, escalation, observability, and applicable evals.

Every skill includes purpose, preconditions, inputs, required context, tools, procedure, evidence requirements, output schema, approval points, failure behavior, and eval criteria.

## Guardrails

- PM outputs cite evidence IDs
- Engineering work links to an approved ticket
- Risky external writes require approval
- Agents cannot approve their own risky output
- Eval decisions cannot rely only on an agent grading itself
- Releases require configured checks and approvals
- Incidents require tracked follow-up actions
