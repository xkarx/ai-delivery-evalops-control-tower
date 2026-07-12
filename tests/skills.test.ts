import { describe, expect, it } from "vitest";
import { agentRunSchema } from "@dailycart/schemas";
import { annotateAgentRun, getSkillDefinition, skillRegistry } from "@dailycart/agents";

describe("executable skill registry", () => {
  it("contains the required role and delivery skills with procedures", () => {
    expect(Object.keys(skillRegistry).length).toBeGreaterThanOrEqual(18);
    expect(getSkillDefinition("implementation-planning")).toMatchObject({ id: "implementation-planning", version: "1.0.0", approvalPoint: "none" });
    expect(getSkillDefinition("prd-generation").approvalPoint).toBe("feature");
  });

  it("attaches skill and provenance metadata to an agent run", () => {
    const run = agentRunSchema.parse({ id: "RUN-9901", agent: "pm", status: "succeeded", startedAt: "2026-07-10T19:00:00.000Z", featureId: "FEAT-0001", ticketIds: [], traceId: "trace-run-9901", costUsd: 0, latencyMs: 1, retries: 0, steps: [], sourceMode: "simulated" });
    const annotated = annotateAgentRun(run, { skillId: "feature-prioritization", contextPackId: "1.0.0", featureBatchId: "BATCH-0101", citedEvidenceIds: ["EVD-0001"], reasoningSummary: "Ranked by evidence strength." });
    expect(annotated).toMatchObject({ skillId: "feature-prioritization", contextPackId: "1.0.0", featureBatchId: "BATCH-0101", citedEvidenceIds: ["EVD-0001"] });
  });
});
