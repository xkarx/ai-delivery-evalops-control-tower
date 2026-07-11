import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LineageGraph } from "../packages/lineage/src/index";
import { agentRunSchema, featureSchema, type Evidence } from "../packages/schemas/src/index";
import {
  DeterministicMockEngineeringExecutor,
  analyzeProductEvidence,
  createPlanningAndDeliveryLineage,
  createTpmPlan,
  executeIndependentEngineeringWorkstreams
} from "../packages/agents/src/index";
import { generateCompany } from "../scripts/generate-company";

const now = "2026-01-15T12:00:00.000Z";

function evidence(id: string, theme: string, kind: Evidence["kind"] = "support"): Evidence {
  return {
    id,
    kind,
    title: `${theme} signal`,
    summary: `Affected shoppers repeatedly report material friction with the ${theme} journey.`,
    occurredAt: now,
    sentiment: "negative",
    tags: [theme],
    sourceMode: "synthetic"
  };
}

describe("PM evidence synthesis", () => {
  it("derives and cites the recommendation from evidence rather than a fixed feature", () => {
    const checkoutScenario = [
      evidence("EVD-0001", "checkout", "support"),
      evidence("EVD-0002", "checkout", "analytics"),
      evidence("EVD-0003", "checkout", "interview"),
      evidence("EVD-0004", "search", "support")
    ];
    const searchScenario = [
      evidence("EVD-0101", "checkout", "support"),
      evidence("EVD-0102", "search", "analytics"),
      evidence("EVD-0103", "search", "incident"),
      evidence("EVD-0104", "search", "interview")
    ];

    const checkoutAnalysis = analyzeProductEvidence(checkoutScenario, { now });
    const searchAnalysis = analyzeProductEvidence(searchScenario, { now });

    expect(checkoutAnalysis.opportunities[0]?.theme).toBe("checkout");
    expect(searchAnalysis.opportunities[0]?.theme).toBe("search");
    expect(searchAnalysis.opportunities[0]?.title).not.toBe(checkoutAnalysis.opportunities[0]?.title);
    expect(checkoutAnalysis.opportunities.map((item) => item.score)).toEqual(
      [...checkoutAnalysis.opportunities].sort((left, right) => right.score - left.score).map((item) => item.score)
    );

    const validEvidenceIds = new Set(checkoutScenario.map((item) => item.id));
    for (const opportunity of checkoutAnalysis.opportunities) {
      expect(() => featureSchema.parse(opportunity)).not.toThrow();
      expect(opportunity.evidenceIds.length).toBeGreaterThan(0);
      expect(opportunity.evidenceIds.every((id) => validEvidenceIds.has(id))).toBe(true);
      expect(opportunity.citations.map((citation) => citation.evidenceId)).toEqual(opportunity.evidenceIds);
    }
    expect(checkoutAnalysis.recommendationRationale).toContain("EVD-0001");
    expect(checkoutAnalysis.run.status).toBe("waiting_approval");
  });

  it("changes recommendation against the repository's generated company scenarios", async () => {
    const analyzeScenario = async (scenario: string) => {
      const directory = await mkdtemp(join(tmpdir(), "dailycart-pm-scenario-"));
      try {
        await generateCompany({ seed: 7357, scenario, outputDirectory: directory });
        const generated = JSON.parse(
          await readFile(join(directory, "research/evidence.json"), "utf8")
        ) as Evidence[];
        return analyzeProductEvidence(generated, { now }).opportunities[0];
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    };
    const checkout = await analyzeScenario("checkout-friction");
    const search = await analyzeScenario("search-relevance");

    expect(checkout?.theme).toBe("checkout-recovery");
    expect(search?.theme).toBe("search-quality");
    expect(checkout?.evidenceIds).not.toEqual(search?.evidenceIds);
  });
});

describe("TPM and engineering delivery", () => {
  it("creates a PRD, dependencies and risks, then records two isolated concurrent workstreams", async () => {
    const analysis = analyzeProductEvidence([
      evidence("EVD-0001", "checkout", "analytics"),
      evidence("EVD-0002", "checkout", "support"),
      evidence("EVD-0003", "checkout", "interview")
    ], { now });
    const candidate = analysis.opportunities[0];
    if (!candidate) throw new Error("Expected a PM opportunity");
    const approved = featureSchema.parse({ ...candidate, status: "approved" });
    const plan = createTpmPlan(approved, { implementationBrief: analysis.implementationBrief, now });

    expect(plan.implementationBrief.evidenceIds).toEqual(approved.evidenceIds);
    expect(plan.implementationBrief.acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
    expect(plan.tickets).toHaveLength(3);
    expect(plan.tickets.filter((ticket) => ticket.dependsOn.length === 0)).toHaveLength(2);
    expect(plan.dependencies[0]?.predecessorTicketIds).toHaveLength(2);
    expect(plan.risks.some((risk) => risk.impact === "high")).toBe(true);

    const workstreams = await executeIndependentEngineeringWorkstreams(
      approved,
      plan.tickets,
      { executor: new DeterministicMockEngineeringExecutor(now) }
    );
    expect(workstreams).toHaveLength(2);
    expect(new Set(workstreams.map((item) => item.ticketId)).size).toBe(2);
    expect(new Set(workstreams.map((item) => item.workstream)).size).toBe(2);
    expect(new Set(workstreams.map((item) => item.branch)).size).toBe(2);
    expect(new Set(workstreams.map((item) => item.run.id)).size).toBe(2);
    expect(workstreams.every((item) => item.executorLabel.startsWith("Mocked"))).toBe(true);
    expect(workstreams.every((item) => item.checks.every((check) => check.measured))).toBe(true);
    workstreams.forEach((item) => expect(() => agentRunSchema.parse(item.run)).not.toThrow());

    const edges = createPlanningAndDeliveryLineage({
      evidenceIds: approved.evidenceIds,
      featureId: approved.id,
      decisionId: "DEC-0001",
      prdId: plan.implementationBrief.id,
      tickets: plan.tickets,
      workstreams,
      createdAt: now
    });
    const graph = new LineageGraph(edges);
    for (const item of workstreams) {
      expect(graph.hasPath(approved.evidenceIds[0] ?? "", item.pullRequestId ?? "")).toBe(true);
    }
  });

  it("refuses TPM planning before the human approval transition", () => {
    const analysis = analyzeProductEvidence([evidence("EVD-0001", "returns")], { now });
    const candidate = analysis.opportunities[0];
    if (!candidate) throw new Error("Expected a PM opportunity");
    expect(() => createTpmPlan(candidate, { implementationBrief: analysis.implementationBrief, now })).toThrow(/approved feature/i);
  });
});
