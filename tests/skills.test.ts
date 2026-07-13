import { describe, expect, it } from "vitest";
import { agentRunSchema } from "@dailycart/schemas";
import { annotateAgentRun, getSkillDefinition, skillRegistry } from "@dailycart/agents";

describe("executable skill registry", () => {
  it("contains the required role and delivery skills with procedures", () => {
    expect(Object.keys(skillRegistry).length).toBeGreaterThanOrEqual(18);
    expect(getSkillDefinition("implementation-planning")).toMatchObject({ id: "implementation-planning", version: "1.0.0", approvalPoint: "none" });
    expect(getSkillDefinition("prd-generation").approvalPoint).toBe("feature");
    expect(getSkillDefinition("agent-output-evaluation")).toMatchObject({ id: "agent-output-evaluation", version: "1.0.0", approvalPoint: "none" });
  });

  it("attaches skill and provenance metadata to an agent run", () => {
    const run = agentRunSchema.parse({ id: "RUN-9901", agent: "pm", status: "succeeded", startedAt: "2026-07-10T19:00:00.000Z", featureId: "FEAT-0001", ticketIds: [], traceId: "trace-run-9901", costUsd: 0, latencyMs: 1, retries: 0, steps: [], sourceMode: "simulated" });
    const annotated = annotateAgentRun(run, { skillId: "feature-prioritization", contextPackId: "1.0.0", featureBatchId: "BATCH-0101", citedEvidenceIds: ["EVD-0001"], reasoningSummary: "Ranked by evidence strength." });
    expect(annotated).toMatchObject({ skillId: "feature-prioritization", contextPackId: "1.0.0", featureBatchId: "BATCH-0101", citedEvidenceIds: ["EVD-0001"] });
  });

  it.each([
    ["context", "context-retrieval"],
    ["research", "interview-synthesis"],
    ["support", "support-ticket-clustering"],
    ["analytics", "analytics-anomaly-analysis"]
  ] as const)("persists the %s insight agent with executable provenance", (agent, skillId) => {
    const run = agentRunSchema.parse({
      id: `RUN-${agent.length + 1000}`,
      agent,
      status: "succeeded",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      featureId: "FEAT-0001",
      ticketIds: [],
      traceId: `trace-${agent}`,
      costUsd: 0,
      latencyMs: 1000,
      retries: 0,
      steps: [{ name: "Analyze evidence", status: "succeeded", durationMs: 1000, detail: "Cited evidence was analyzed." }],
      sourceMode: "live"
    });

    expect(annotateAgentRun(run, {
      skillId,
      contextPackId: "1.0.0",
      citedEvidenceIds: ["EVD-1001"]
    })).toMatchObject({ agent, skillId, skillVersion: "1.0.0", contextPackId: "1.0.0", citedEvidenceIds: ["EVD-1001"] });
  });
});
