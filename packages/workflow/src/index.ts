import {
  approvalSchema,
  entityIdSchema,
  sourceModeSchema,
  type Approval,
  type SourceMode
} from "@dailycart/schemas";

export type WorkflowPhase =
  | "draft"
  | "awaiting_feature_approval"
  | "planning"
  | "delivery"
  | "evaluation"
  | "blocked"
  | "awaiting_release_approval"
  | "ready_to_release"
  | "released"
  | "rejected";

export interface WorkflowEvent {
  id: string;
  at: string;
  from: WorkflowPhase | null;
  to: WorkflowPhase;
  actor: string;
  reason: string;
  entityIds: string[];
}

export interface PendingHumanApproval {
  approval: Approval;
  requestedBy: string;
}

export interface WorkflowSnapshot {
  id: string;
  featureId: string;
  phase: WorkflowPhase;
  revision: number;
  sourceMode: SourceMode;
  pendingApproval?: PendingHumanApproval;
  decisionIds: string[];
  ticketIds: string[];
  engineeringRunIds: string[];
  evalCampaignIds: string[];
  deploymentId?: string;
  history: WorkflowEvent[];
}

export interface HumanApprovalDecision {
  approvalId: string;
  status: "approved" | "rejected";
  reviewer: string;
  rationale: string;
  resolvedAt?: string;
  decisionId?: string;
}

export interface WorkflowStartOptions {
  id: string;
  featureId: string;
  actor: string;
  sourceMode?: SourceMode;
}

export interface EvalGateOutcome {
  campaignId: string;
  releaseAllowed: boolean;
  reason: string;
  actor: string;
  releaseApprovalId?: string;
}

type Clock = () => string;

const phases: readonly WorkflowPhase[] = [
  "draft",
  "awaiting_feature_approval",
  "planning",
  "delivery",
  "evaluation",
  "blocked",
  "awaiting_release_approval",
  "ready_to_release",
  "released",
  "rejected"
];

function cloneSnapshot(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return {
    ...snapshot,
    pendingApproval: snapshot.pendingApproval
      ? {
          requestedBy: snapshot.pendingApproval.requestedBy,
          approval: { ...snapshot.pendingApproval.approval }
        }
      : undefined,
    decisionIds: [...snapshot.decisionIds],
    ticketIds: [...snapshot.ticketIds],
    engineeringRunIds: [...snapshot.engineeringRunIds],
    evalCampaignIds: [...snapshot.evalCampaignIds],
    history: snapshot.history.map((event) => ({
      ...event,
      entityIds: [...event.entityIds]
    }))
  };
}

function validateTimestamp(timestamp: string): void {
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Invalid workflow timestamp: ${timestamp}`);
  }
}

function assertUniqueStableIds(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} must contain unique IDs`);
  }
  for (const id of ids) entityIdSchema.parse(id);
}

function validateSnapshot(snapshot: WorkflowSnapshot): void {
  entityIdSchema.parse(snapshot.id);
  entityIdSchema.parse(snapshot.featureId);
  sourceModeSchema.parse(snapshot.sourceMode);
  if (!phases.includes(snapshot.phase)) throw new Error(`Unknown phase ${snapshot.phase}`);
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
    throw new Error("Workflow revision must be a non-negative integer");
  }
  assertUniqueStableIds(snapshot.decisionIds, "Decision IDs");
  assertUniqueStableIds(snapshot.ticketIds, "Ticket IDs");
  assertUniqueStableIds(snapshot.engineeringRunIds, "Engineering run IDs");
  assertUniqueStableIds(snapshot.evalCampaignIds, "Eval campaign IDs");
  if (snapshot.deploymentId) entityIdSchema.parse(snapshot.deploymentId);
  if (snapshot.pendingApproval) {
    approvalSchema.parse(snapshot.pendingApproval.approval);
    if (snapshot.pendingApproval.requestedBy.trim().length < 2) {
      throw new Error("Approval requester is required");
    }
  }
  const shouldBePaused =
    snapshot.phase === "awaiting_feature_approval" ||
    snapshot.phase === "awaiting_release_approval";
  if (shouldBePaused !== Boolean(snapshot.pendingApproval)) {
    throw new Error("Paused workflow phases must have exactly one pending approval");
  }
  for (const event of snapshot.history) {
    entityIdSchema.parse(event.id);
    validateTimestamp(event.at);
  }
}

/**
 * Serializable workflow state machine. It never auto-approves a risky
 * transition: feature and release approvals pause until a different human
 * supplies a decision, even after the snapshot is rehydrated in a new process.
 */
export class DeliveryWorkflow {
  #state: WorkflowSnapshot;
  readonly #clock: Clock;

  private constructor(snapshot: WorkflowSnapshot, clock: Clock) {
    validateSnapshot(snapshot);
    this.#state = cloneSnapshot(snapshot);
    this.#clock = clock;
  }

  static start(options: WorkflowStartOptions, clock: Clock = () => new Date().toISOString()): DeliveryWorkflow {
    entityIdSchema.parse(options.id);
    entityIdSchema.parse(options.featureId);
    const at = clock();
    validateTimestamp(at);
    const snapshot: WorkflowSnapshot = {
      id: options.id,
      featureId: options.featureId,
      phase: "draft",
      revision: 0,
      sourceMode: sourceModeSchema.parse(options.sourceMode ?? "synthetic"),
      decisionIds: [],
      ticketIds: [],
      engineeringRunIds: [],
      evalCampaignIds: [],
      history: [
        {
          id: "ACT-0001",
          at,
          from: null,
          to: "draft",
          actor: options.actor,
          reason: "Workflow created from evidence-linked feature",
          entityIds: [options.featureId]
        }
      ]
    };
    return new DeliveryWorkflow(snapshot, clock);
  }

  static hydrate(serialized: string | WorkflowSnapshot, clock: Clock = () => new Date().toISOString()): DeliveryWorkflow {
    const value: unknown = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
    if (!value || typeof value !== "object") throw new Error("Invalid workflow snapshot");
    return new DeliveryWorkflow(value as WorkflowSnapshot, clock);
  }

  snapshot(): WorkflowSnapshot {
    return cloneSnapshot(this.#state);
  }

  serialize(): string {
    return JSON.stringify(this.#state);
  }

  get isPaused(): boolean {
    return this.#state.pendingApproval !== undefined;
  }

  requestFeatureApproval(approvalId: string, requestedBy: string): WorkflowSnapshot {
    this.#requirePhase("draft");
    this.#requestApproval(approvalId, "feature", requestedBy, "Feature recommendation requires human approval");
    return this.snapshot();
  }

  resumeWithHumanDecision(decision: HumanApprovalDecision): WorkflowSnapshot {
    const pending = this.#state.pendingApproval;
    if (!pending) throw new Error("Workflow is not waiting for human approval");
    if (decision.approvalId !== pending.approval.id) {
      throw new Error(`Approval ${decision.approvalId} does not match pending ${pending.approval.id}`);
    }
    if (decision.reviewer.trim().length < 2 || decision.rationale.trim().length < 5) {
      throw new Error("Human decisions require a reviewer and meaningful rationale");
    }
    if (decision.reviewer === pending.requestedBy) {
      throw new Error("The approval requester cannot approve their own risky transition");
    }

    const resolvedAt = decision.resolvedAt ?? this.#clock();
    const approval = approvalSchema.parse({
      ...pending.approval,
      status: decision.status,
      reviewer: decision.reviewer,
      rationale: decision.rationale,
      resolvedAt
    });
    const stage = approval.stage;
    if (stage === "feature" && !decision.decisionId) {
      throw new Error("Feature approval must create a stable decision record");
    }
    const previous = this.#state.phase;
    this.#state.pendingApproval = undefined;
    if (decision.decisionId) {
      entityIdSchema.parse(decision.decisionId);
      if (!this.#state.decisionIds.includes(decision.decisionId)) {
        this.#state.decisionIds.push(decision.decisionId);
      }
    }

    let next: WorkflowPhase;
    if (decision.status === "rejected") {
      next = stage === "feature" ? "rejected" : "blocked";
    } else {
      next = stage === "feature" ? "planning" : "ready_to_release";
    }
    this.#transition(previous, next, decision.reviewer, decision.rationale, [approval.id, ...(decision.decisionId ? [decision.decisionId] : [])]);
    return this.snapshot();
  }

  completePlanning(ticketIds: readonly string[], actor: string): WorkflowSnapshot {
    this.#requirePhase("planning");
    if (ticketIds.length < 2) {
      throw new Error("Delivery planning must contain at least two independently executable tickets");
    }
    assertUniqueStableIds(ticketIds, "Ticket IDs");
    this.#state.ticketIds = [...ticketIds];
    this.#transition("planning", "delivery", actor, "Approved feature scope organized into executable workstreams", ticketIds);
    return this.snapshot();
  }

  completeDelivery(runIds: readonly string[], actor: string): WorkflowSnapshot {
    this.#requirePhase("delivery");
    if (runIds.length < 2) {
      throw new Error("At least two independent engineering run records are required");
    }
    assertUniqueStableIds(runIds, "Engineering run IDs");
    this.#state.engineeringRunIds = [...runIds];
    this.#transition("delivery", "evaluation", actor, "Independent engineering workstreams completed", runIds);
    return this.snapshot();
  }

  recordEvalGate(outcome: EvalGateOutcome): WorkflowSnapshot {
    this.#requirePhase("evaluation");
    entityIdSchema.parse(outcome.campaignId);
    if (!this.#state.evalCampaignIds.includes(outcome.campaignId)) {
      this.#state.evalCampaignIds.push(outcome.campaignId);
    }

    if (!outcome.releaseAllowed) {
      this.#transition("evaluation", "blocked", outcome.actor, outcome.reason, [outcome.campaignId]);
      return this.snapshot();
    }
    if (!outcome.releaseApprovalId) {
      throw new Error("A passing eval gate must request an explicit release approval");
    }
    this.#requestApproval(
      outcome.releaseApprovalId,
      "release",
      outcome.actor,
      `Eval campaign ${outcome.campaignId} passed; release approval required`,
      [outcome.campaignId]
    );
    return this.snapshot();
  }

  rerunAfterCorrection(actor: string, reason: string): WorkflowSnapshot {
    this.#requirePhase("blocked");
    this.#transition("blocked", "evaluation", actor, reason, []);
    return this.snapshot();
  }

  markReleased(deploymentId: string, actor: string): WorkflowSnapshot {
    this.#requirePhase("ready_to_release");
    entityIdSchema.parse(deploymentId);
    this.#state.deploymentId = deploymentId;
    this.#transition("ready_to_release", "released", actor, "Approved release deployed", [deploymentId]);
    return this.snapshot();
  }

  #requestApproval(
    approvalId: string,
    stage: "feature" | "release",
    requestedBy: string,
    reason: string,
    additionalEntityIds: readonly string[] = []
  ): void {
    entityIdSchema.parse(approvalId);
    if (requestedBy.trim().length < 2) throw new Error("Approval requester is required");
    const requestedAt = this.#clock();
    const approval = approvalSchema.parse({
      id: approvalId,
      featureId: this.#state.featureId,
      stage,
      status: "pending",
      requestedAt,
      sourceMode: this.#state.sourceMode
    });
    const previous = this.#state.phase;
    const next = stage === "feature" ? "awaiting_feature_approval" : "awaiting_release_approval";
    this.#state.pendingApproval = { approval, requestedBy };
    this.#transition(previous, next, requestedBy, reason, [approvalId, ...additionalEntityIds]);
  }

  #requirePhase(expected: WorkflowPhase): void {
    if (this.#state.phase !== expected) {
      throw new Error(`Expected workflow phase ${expected}; received ${this.#state.phase}`);
    }
  }

  #transition(
    from: WorkflowPhase,
    to: WorkflowPhase,
    actor: string,
    reason: string,
    entityIds: readonly string[]
  ): void {
    if (this.#state.phase !== from) {
      throw new Error(`Illegal transition: state is ${this.#state.phase}, not ${from}`);
    }
    for (const id of entityIds) entityIdSchema.parse(id);
    const at = this.#clock();
    validateTimestamp(at);
    this.#state.phase = to;
    this.#state.revision += 1;
    this.#state.history.push({
      id: `ACT-${String(this.#state.history.length + 1).padStart(4, "0")}`,
      at,
      from,
      to,
      actor,
      reason,
      entityIds: [...entityIds]
    });
    validateSnapshot(this.#state);
  }
}
