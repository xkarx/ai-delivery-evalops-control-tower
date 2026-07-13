import { randomUUID } from "node:crypto";
import { workflowActionSchema, type WorkflowAction, type WorkflowCommand, type WorkflowProgressStep } from "@dailycart/schemas";
import { readArtifact, writeArtifact } from "./durable-artifacts";

type ActionStore = Record<string, WorkflowAction>;

function token(): string { return randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(); }
export function newSessionId(): string { return `SESSION-${Date.now()}${token().slice(0, 12)}`; }
export function newWorkflowId(): string { return `WORKFLOW-${Date.now()}${token().slice(0, 12)}`; }
export function newActionId(): string { return `ACTION-${token()}`; }

export const DEFAULT_EXECUTION_LEASE_MS = 60_000;

export type ExecutionLease = NonNullable<WorkflowAction["executionLease"]>;

type LeaseResult = { action: WorkflowAction; acquired: boolean; lease?: ExecutionLease };

// Keep same-process recovery calls serialized. The durable lease below also
// protects across workers; this mutex closes the read/write race locally.
const leaseLocks = new Map<string, Promise<void>>();

async function withLeaseLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = leaseLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  leaseLocks.set(key, chain);
  await previous;
  try { return await work(); } finally {
    release();
    if (leaseLocks.get(key) === chain) leaseLocks.delete(key);
  }
}

function leaseExpired(lease: ExecutionLease, now: number): boolean {
  return Date.parse(lease.expiresAt) <= now;
}

export async function acquireExecutionLease(actionId: string, sessionId: string, owner: string, ttlMs = DEFAULT_EXECUTION_LEASE_MS): Promise<LeaseResult> {
  return withLeaseLock(`${sessionId}:${actionId}`, async () => {
    const current = await getAction(actionId, sessionId);
    if (!current) throw new Error(`Workflow action ${actionId} was not found.`);
    const now = Date.now();
    if (current.executionLease && !leaseExpired(current.executionLease, now) && current.executionLease.owner !== owner) {
      return { action: current, acquired: false };
    }
    const acquiredAt = new Date(now).toISOString();
    const lease: ExecutionLease = {
      token: randomUUID(), owner, acquiredAt,
      heartbeatAt: acquiredAt,
      expiresAt: new Date(now + ttlMs).toISOString()
    };
    const action = await updateAction(actionId, { executionLease: lease }, sessionId);
    return { action, acquired: true, lease };
  });
}

export async function releaseExecutionLease(actionId: string, sessionId: string, owner: string, token: string): Promise<WorkflowAction | undefined> {
  return withLeaseLock(`${sessionId}:${actionId}`, async () => {
    const current = await getAction(actionId, sessionId);
    if (!current || current.executionLease?.owner !== owner || current.executionLease.token !== token) return current;
    return updateAction(actionId, { executionLease: undefined }, sessionId);
  });
}

export async function readActions(sessionId: string): Promise<ActionStore> { return await readArtifact<ActionStore>("workflowActions", sessionId) ?? {}; }
export async function getAction(actionId: string, sessionId: string): Promise<WorkflowAction | undefined> { return (await readActions(sessionId))[actionId]; }

export async function saveAction(action: WorkflowAction): Promise<WorkflowAction> {
  const store = await readActions(action.sessionId);
  store[action.actionId] = workflowActionSchema.parse(action);
  await writeArtifact("workflowActions", store, action.sessionId);
  return store[action.actionId]!;
}

export async function createWorkflowAction(input: { command: WorkflowCommand; sessionId: string; workflowId: string; revision: number; featureId?: string; executionMode?: "showcase" | "full_verification"; parentPhase?: string }): Promise<{ action: WorkflowAction; reused: boolean }> {
  const store = await readActions(input.sessionId);
  const executionMode = input.executionMode ?? "showcase";
  const idempotencyKey = `${input.sessionId}:${input.command}:${input.featureId ?? "workflow"}:${input.revision}:${executionMode}`;
  const existing = Object.values(store).find((item) => item.idempotencyKey === idempotencyKey && ["queued", "running", "waiting_human", "succeeded"].includes(item.status));
  if (existing) return { action: existing, reused: true };
  const now = new Date().toISOString();
  const action = workflowActionSchema.parse({
    actionId: newActionId(), sessionId: input.sessionId, workflowId: input.workflowId, command: input.command, executionMode, parentPhase: input.parentPhase,
    idempotencyKey, status: "queued", phase: "queued", progress: 0, message: "Action queued for durable execution.",
    nextAction: "Follow the live execution timeline.", attempts: 0, steps: [], externalRefs: [], createdAt: now, updatedAt: now, heartbeatAt: now
  });
  store[action.actionId] = action;
  await writeArtifact("workflowActions", store, input.sessionId);
  return { action, reused: false };
}

export async function updateAction(actionId: string, patch: Partial<Omit<WorkflowAction, "actionId" | "sessionId" | "workflowId" | "command" | "idempotencyKey" | "createdAt">>, sessionId: string): Promise<WorkflowAction> {
  const current = await getAction(actionId, sessionId);
  if (!current) throw new Error(`Workflow action ${actionId} was not found.`);
  const now = new Date().toISOString();
  const hasLeasePatch = Object.prototype.hasOwnProperty.call(patch, "executionLease");
  const refreshedLease = current.executionLease && !hasLeasePatch ? {
    ...current.executionLease,
    heartbeatAt: now,
    expiresAt: new Date(Date.now() + DEFAULT_EXECUTION_LEASE_MS).toISOString()
  } : undefined;
  return saveAction({ ...current, ...patch, ...(refreshedLease ? { executionLease: refreshedLease } : {}), actionId: current.actionId, sessionId: current.sessionId, workflowId: current.workflowId, command: current.command, idempotencyKey: current.idempotencyKey, createdAt: current.createdAt, updatedAt: now, heartbeatAt: now });
}

export async function recordActionStep(actionId: string, step: WorkflowProgressStep, patch: Partial<WorkflowAction> = {}, sessionId: string): Promise<WorkflowAction> {
  const current = await getAction(actionId, sessionId);
  if (!current) throw new Error(`Workflow action ${actionId} was not found.`);
  const steps = [...current.steps.filter((item) => item.id !== step.id), step];
  return updateAction(actionId, { ...patch, steps }, sessionId);
}

export function latestAction(store: ActionStore, sessionId?: string): WorkflowAction | undefined {
  return Object.values(store).filter((item) => !sessionId || item.sessionId === sessionId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
