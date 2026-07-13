import { randomUUID } from "node:crypto";
import { workflowActionSchema, type WorkflowAction, type WorkflowCommand, type WorkflowProgressStep } from "@dailycart/schemas";
import { readArtifact, writeArtifact } from "./durable-artifacts";

type ActionStore = Record<string, WorkflowAction>;

function token(): string { return randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(); }
export function newSessionId(): string { return `SESSION-${Date.now()}${token().slice(0, 12)}`; }
export function newWorkflowId(): string { return `WORKFLOW-${Date.now()}${token().slice(0, 12)}`; }
export function newActionId(): string { return `ACTION-${token()}`; }

export async function readActions(): Promise<ActionStore> { return await readArtifact<ActionStore>("workflowActions") ?? {}; }
export async function getAction(actionId: string): Promise<WorkflowAction | undefined> { return (await readActions())[actionId]; }

export async function saveAction(action: WorkflowAction): Promise<WorkflowAction> {
  const store = await readActions();
  store[action.actionId] = workflowActionSchema.parse(action);
  await writeArtifact("workflowActions", store);
  return store[action.actionId]!;
}

export async function createWorkflowAction(input: { command: WorkflowCommand; sessionId: string; workflowId: string; revision: number }): Promise<{ action: WorkflowAction; reused: boolean }> {
  const store = await readActions();
  const idempotencyKey = `${input.sessionId}:${input.command}:${input.revision}`;
  const existing = Object.values(store).find((item) => item.idempotencyKey === idempotencyKey && ["queued", "running", "waiting_human", "succeeded"].includes(item.status));
  if (existing) return { action: existing, reused: true };
  const now = new Date().toISOString();
  const action = workflowActionSchema.parse({
    actionId: newActionId(), sessionId: input.sessionId, workflowId: input.workflowId, command: input.command,
    idempotencyKey, status: "queued", phase: "queued", progress: 0, message: "Action queued for durable execution.",
    nextAction: "Follow the live execution timeline.", attempts: 0, steps: [], externalRefs: [], createdAt: now, updatedAt: now, heartbeatAt: now
  });
  store[action.actionId] = action;
  await writeArtifact("workflowActions", store);
  return { action, reused: false };
}

export async function updateAction(actionId: string, patch: Partial<Omit<WorkflowAction, "actionId" | "sessionId" | "workflowId" | "command" | "idempotencyKey" | "createdAt">>): Promise<WorkflowAction> {
  const current = await getAction(actionId);
  if (!current) throw new Error(`Workflow action ${actionId} was not found.`);
  const now = new Date().toISOString();
  return saveAction({ ...current, ...patch, actionId: current.actionId, sessionId: current.sessionId, workflowId: current.workflowId, command: current.command, idempotencyKey: current.idempotencyKey, createdAt: current.createdAt, updatedAt: now, heartbeatAt: now });
}

export async function recordActionStep(actionId: string, step: WorkflowProgressStep, patch: Partial<WorkflowAction> = {}): Promise<WorkflowAction> {
  const current = await getAction(actionId);
  if (!current) throw new Error(`Workflow action ${actionId} was not found.`);
  const steps = [...current.steps.filter((item) => item.id !== step.id), step];
  return updateAction(actionId, { ...patch, steps });
}

export function latestAction(store: ActionStore, sessionId?: string): WorkflowAction | undefined {
  return Object.values(store).filter((item) => !sessionId || item.sessionId === sessionId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
