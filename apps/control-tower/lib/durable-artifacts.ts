import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDatabaseAdapter } from "@dailycart/connectors";

export type ArtifactKey =
  | "demoState"
  | "workflow"
  | "workflowReviews"
  | "workflowPreview"
  | "workflowPreviewEval"
  | "workflowSync"
  | "linearSync"
  | "agentHandoffs"
  | "evalAuthoredCases"
  | "evalLastRun"
  | "productEvents"
  | "actionReceipts";

const definitions: Record<ArtifactKey, { id: string; file: string; title: string }> = {
  demoState: { id: "STATE-9001", file: "demo-state.json", title: "Current demo state" },
  workflow: { id: "WORKFLOW-9001", file: "workflow-run.json", title: "Current delivery workflow" },
  workflowReviews: { id: "REVIEWS-9001", file: "workflow-reviews.json", title: "Agent review outputs" },
  workflowPreview: { id: "PREVIEW-9001", file: "workflow-preview.json", title: "Preview builds" },
  workflowPreviewEval: { id: "PREVIEWEVAL-9001", file: "workflow-preview-eval.json", title: "Preview evaluation results" },
  workflowSync: { id: "SYNC-9001", file: "workflow-external-sync.json", title: "Workflow provider synchronization" },
  linearSync: { id: "LINEAR-9001", file: "linear-delivery-sync.json", title: "Linear delivery synchronization" },
  agentHandoffs: { id: "HANDOFFS-9001", file: "agent-handoffs.json", title: "Slack agent handoffs" },
  evalAuthoredCases: { id: "EVALCASES-9001", file: "eval-authored-cases.json", title: "Authored eval cases" },
  evalLastRun: { id: "EVALRUN-9001", file: "eval-authored-last-run.json", title: "Latest eval execution" },
  productEvents: { id: "EVENTS-9001", file: "product-events.json", title: "Product events" },
  actionReceipts: { id: "ACTIONS-9001", file: "action-receipts.json", title: "Operator action receipts" }
};

function livePersistence(): boolean {
  return process.env.INTEGRATION_MODE === "live" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function localFile(key: ArtifactKey): string {
  return path.resolve(process.cwd(), "../..", "artifacts", definitions[key].file);
}

export async function readArtifact<T>(key: ArtifactKey): Promise<T | undefined> {
  const definition = definitions[key];
  if (livePersistence()) {
    const rows = await createDatabaseAdapter({ env: process.env }).select<{ id: string; payload: { value?: T; cleared?: boolean } }>("entities", { id: definition.id });
    const payload = rows[0]?.payload;
    return payload?.cleared ? undefined : payload?.value;
  }
  try {
    return JSON.parse(await readFile(localFile(key), "utf8")) as T;
  } catch {
    return undefined;
  }
}

export async function writeArtifact<T>(key: ArtifactKey, value: T): Promise<void> {
  const definition = definitions[key];
  if (livePersistence()) {
    await createDatabaseAdapter({ env: process.env }).upsert("entities", {
      id: definition.id,
      entity_type: "demo_artifact",
      title: definition.title,
      source_mode: "live",
      payload: { value, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString()
    }, "id");
    return;
  }
  const file = localFile(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function clearArtifact(key: ArtifactKey): Promise<void> {
  const definition = definitions[key];
  if (livePersistence()) {
    await createDatabaseAdapter({ env: process.env }).upsert("entities", {
      id: definition.id,
      entity_type: "demo_artifact",
      title: definition.title,
      source_mode: "live",
      payload: { cleared: true, clearedAt: new Date().toISOString() },
      updated_at: new Date().toISOString()
    }, "id");
    return;
  }
  await rm(localFile(key), { force: true });
}

export async function clearWorkflowArtifacts(): Promise<void> {
  await Promise.all([
    "workflow", "workflowReviews", "workflowPreview", "workflowPreviewEval",
    "workflowSync", "linearSync", "agentHandoffs", "evalLastRun", "productEvents"
  ].map((key) => clearArtifact(key as ArtifactKey)));
}

export async function appendArtifact<T>(key: ArtifactKey, item: T, limit = 500): Promise<T[]> {
  const current = await readArtifact<T[]>(key) ?? [];
  const next = [...current, item].slice(-limit);
  await writeArtifact(key, next);
  return next;
}

export interface ActionReceipt {
  actionId: string;
  sessionId: string;
  workflowId?: string;
  status: "queued" | "running" | "waiting_human" | "succeeded" | "failed";
  phase: string;
  message: string;
  nextAction: string;
  deepLink: string;
  sourceMode: "live" | "deterministic-fallback" | "simulated";
  at: string;
  externalRefs: Array<{ provider: string; id: string; url?: string }>;
  error?: { code: string; detail: string; retryable: boolean };
}

export async function recordActionReceipt(receipt: ActionReceipt): Promise<ActionReceipt> {
  await appendArtifact("actionReceipts", receipt, 100);
  return receipt;
}
