import {
  entityIdSchema,
  lineageEdgeSchema,
  type LineageEdge
} from "@dailycart/schemas";

export const stableIdPrefixes = [
  "ORG",
  "PROD",
  "CUS",
  "PER",
  "EVD",
  "FEAT",
  "DEC",
  "PRD",
  "PROJ",
  "TKT",
  "RUN",
  "APR",
  "PR",
  "EVAL",
  "EVALCASE",
  "DEP",
  "REL",
  "INC",
  "ACT",
  "EXT"
] as const;

export type StableIdPrefix = (typeof stableIdPrefixes)[number];

export interface EntityReference {
  type: string;
  id: string;
}

export interface LineageLink {
  source: EntityReference;
  relationship: string;
  target: EntityReference;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export function stableId(prefix: StableIdPrefix, ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new Error(`Stable ID ordinal must be a positive integer; received ${ordinal}`);
  }

  return `${prefix}-${String(ordinal).padStart(4, "0")}`;
}

export class StableIdAllocator {
  readonly #counters = new Map<StableIdPrefix, number>();

  constructor(initial: Partial<Record<StableIdPrefix, number>> = {}) {
    for (const prefix of stableIdPrefixes) {
      const value = initial[prefix];
      if (value !== undefined) {
        if (!Number.isSafeInteger(value) || value < 0) {
          throw new Error(`Initial counter for ${prefix} must be a non-negative integer`);
        }
        this.#counters.set(prefix, value);
      }
    }
  }

  next(prefix: StableIdPrefix): string {
    const ordinal = (this.#counters.get(prefix) ?? 0) + 1;
    this.#counters.set(prefix, ordinal);
    return stableId(prefix, ordinal);
  }

  current(prefix: StableIdPrefix): number {
    return this.#counters.get(prefix) ?? 0;
  }
}

function entityKey(reference: EntityReference): string {
  return `${reference.type}:${reference.id}`;
}

function validateReference(reference: EntityReference): void {
  entityIdSchema.parse(reference.id);
  if (reference.type.trim().length === 0) {
    throw new Error("Lineage entity type cannot be empty");
  }
}

function cloneEdge(edge: LineageEdge): LineageEdge {
  return {
    ...edge,
    metadata: { ...edge.metadata }
  };
}

/**
 * An in-memory, deterministic lineage store used by demo mode and tests. Live
 * database adapters can persist the returned normalized LineageEdge objects.
 */
export class LineageGraph {
  readonly #edges: LineageEdge[] = [];
  readonly #signatures = new Set<string>();

  constructor(edges: readonly LineageEdge[] = []) {
    for (const edge of edges) {
      this.addEdge({
        source: { type: edge.sourceType, id: edge.sourceId },
        relationship: edge.relationship,
        target: { type: edge.targetType, id: edge.targetId },
        createdAt: edge.createdAt,
        metadata: edge.metadata
      });
    }
  }

  addEdge(link: LineageLink): LineageEdge {
    validateReference(link.source);
    validateReference(link.target);
    const relationship = link.relationship.trim();
    if (relationship.length === 0) {
      throw new Error("Lineage relationship cannot be empty");
    }

    const signature = [
      entityKey(link.source),
      relationship,
      entityKey(link.target)
    ].join("|");
    if (this.#signatures.has(signature)) {
      const existing = this.#edges.find((edge) =>
        edge.sourceId === link.source.id &&
        edge.targetId === link.target.id &&
        edge.relationship === relationship
      );
      if (!existing) {
        throw new Error(`Lineage signature collision: ${signature}`);
      }
      return cloneEdge(existing);
    }

    const edge = lineageEdgeSchema.parse({
      id: `LIN-${String(this.#edges.length + 1).padStart(4, "0")}`,
      sourceType: link.source.type,
      sourceId: link.source.id,
      relationship,
      targetType: link.target.type,
      targetId: link.target.id,
      createdAt: link.createdAt,
      metadata: link.metadata ?? {}
    });

    this.#edges.push(edge);
    this.#signatures.add(signature);
    return cloneEdge(edge);
  }

  addPath(links: readonly LineageLink[]): LineageEdge[] {
    return links.map((link) => this.addEdge(link));
  }

  edges(): LineageEdge[] {
    return this.#edges.map(cloneEdge);
  }

  edgesFor(entityId: string): LineageEdge[] {
    entityIdSchema.parse(entityId);
    return this.#edges
      .filter((edge) => edge.sourceId === entityId || edge.targetId === entityId)
      .map(cloneEdge);
  }

  hasPath(sourceId: string, targetId: string): boolean {
    entityIdSchema.parse(sourceId);
    entityIdSchema.parse(targetId);
    if (sourceId === targetId) return true;

    const visited = new Set<string>([sourceId]);
    const queue = [sourceId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const edge of this.#edges) {
        if (edge.sourceId !== current || visited.has(edge.targetId)) continue;
        if (edge.targetId === targetId) return true;
        visited.add(edge.targetId);
        queue.push(edge.targetId);
      }
    }
    return false;
  }

  path(sourceId: string, targetId: string): LineageEdge[] {
    entityIdSchema.parse(sourceId);
    entityIdSchema.parse(targetId);
    const queue: Array<{ id: string; path: LineageEdge[] }> = [
      { id: sourceId, path: [] }
    ];
    const visited = new Set<string>([sourceId]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current.id === targetId) return current.path.map(cloneEdge);

      for (const edge of this.#edges) {
        if (edge.sourceId !== current.id || visited.has(edge.targetId)) continue;
        visited.add(edge.targetId);
        queue.push({ id: edge.targetId, path: [...current.path, edge] });
      }
    }

    return [];
  }

  assertPath(sourceId: string, targetId: string): void {
    if (!this.hasPath(sourceId, targetId)) {
      throw new Error(`Missing lineage path from ${sourceId} to ${targetId}`);
    }
  }
}

export function buildLifecycleLineage(
  ids: {
    evidenceIds: readonly string[];
    featureId: string;
    decisionId: string;
    prdId: string;
    ticketIds: readonly string[];
    runIds: readonly string[];
    pullRequestIds?: readonly string[];
    evalId: string;
    deploymentId?: string;
    incidentId?: string;
    regressionCaseId?: string;
  },
  createdAt: string
): LineageEdge[] {
  if (ids.ticketIds.length !== ids.runIds.length) {
    throw new Error("Each engineering ticket must have a corresponding run ID");
  }

  const graph = new LineageGraph();
  for (const evidenceId of ids.evidenceIds) {
    graph.addEdge({
      source: { type: "evidence", id: evidenceId },
      relationship: "supports",
      target: { type: "feature", id: ids.featureId },
      createdAt
    });
  }
  graph.addPath([
    {
      source: { type: "feature", id: ids.featureId },
      relationship: "approved_by",
      target: { type: "decision", id: ids.decisionId },
      createdAt
    },
    {
      source: { type: "feature", id: ids.featureId },
      relationship: "specified_by",
      target: { type: "prd", id: ids.prdId },
      createdAt
    }
  ]);

  ids.ticketIds.forEach((ticketId, index) => {
    const runId = ids.runIds[index];
    if (!runId) throw new Error(`Missing run for ${ticketId}`);
    graph.addPath([
      {
        source: { type: "prd", id: ids.prdId },
        relationship: "decomposed_into",
        target: { type: "ticket", id: ticketId },
        createdAt
      },
      {
        source: { type: "ticket", id: ticketId },
        relationship: "executed_by",
        target: { type: "agent_run", id: runId },
        createdAt
      },
      {
        source: { type: "agent_run", id: runId },
        relationship: "evaluated_by",
        target: { type: "eval_campaign", id: ids.evalId },
        createdAt
      }
    ]);
    const pullRequestId = ids.pullRequestIds?.[index];
    if (pullRequestId) {
      graph.addEdge({
        source: { type: "agent_run", id: runId },
        relationship: "produced",
        target: { type: "pull_request", id: pullRequestId },
        createdAt
      });
    }
  });

  if (ids.deploymentId) {
    graph.addEdge({
      source: { type: "eval_campaign", id: ids.evalId },
      relationship: "gated",
      target: { type: "deployment", id: ids.deploymentId },
      createdAt
    });
  }
  if (ids.incidentId && ids.deploymentId) {
    graph.addEdge({
      source: { type: "deployment", id: ids.deploymentId },
      relationship: "observed_in",
      target: { type: "incident", id: ids.incidentId },
      createdAt
    });
  }
  if (ids.incidentId && ids.regressionCaseId) {
    graph.addEdge({
      source: { type: "incident", id: ids.incidentId },
      relationship: "creates_regression_case",
      target: { type: "eval_case", id: ids.regressionCaseId },
      createdAt
    });
  }

  return graph.edges();
}
