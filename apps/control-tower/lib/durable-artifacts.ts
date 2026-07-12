import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

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
  | "actionReceipts"
  | "structuredRecords";

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
  actionReceipts: { id: "ACTIONS-9001", file: "action-receipts.json", title: "Operator action receipts" },
  structuredRecords: { id: "RECORDS-9001", file: "structured-records.json", title: "Durable workflow records" }
};

const storageBucket = "dailycart-control-tower";
let storageBucketReady: Promise<void> | undefined;

function livePersistence(): boolean {
  return process.env.INTEGRATION_MODE === "live" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function storageHeaders(contentType?: string): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, authorization: `Bearer ${key}`, ...(contentType ? { "content-type": contentType } : {}) };
}

async function ensureStorageBucket(): Promise<void> {
  storageBucketReady ??= (async () => {
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket`;
    const existing = await fetch(`${base}/${storageBucket}`, { headers: storageHeaders() });
    if (existing.ok) return;
    const response = await fetch(base, {
      method: "POST", headers: storageHeaders("application/json"),
      body: JSON.stringify({ id: storageBucket, name: storageBucket, public: false, file_size_limit: 2_000_000 })
    });
    if (response.ok || response.status === 409) return;
    const confirmed = await fetch(`${base}/${storageBucket}`, { headers: storageHeaders() });
    if (confirmed.ok) return;
    throw new Error(`Supabase durable storage setup failed with HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`);
  })().catch((error) => { storageBucketReady = undefined; throw error; });
  return storageBucketReady;
}

async function readStorageObject<T>(file: string): Promise<T | undefined> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${storageBucket}/${file}`, { headers: storageHeaders() });
  if (response.status === 400 || response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Supabase durable read failed with HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

async function writeStorageObject<T>(file: string, value: T): Promise<void> {
  await ensureStorageBucket();
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${storageBucket}/${file}`, {
    method: "POST", headers: { ...storageHeaders("application/json"), "x-upsert": "true" }, body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error(`Supabase durable write failed with HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`);
}

function localFile(key: ArtifactKey): string {
  return path.resolve(process.cwd(), "../..", "artifacts", definitions[key].file);
}

export async function readArtifact<T>(key: ArtifactKey): Promise<T | undefined> {
  const definition = definitions[key];
  if (livePersistence()) {
    const payload = await readStorageObject<{ value?: T; cleared?: boolean }>(definition.file);
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
    await writeStorageObject(definition.file, { id: definition.id, title: definition.title, value, updatedAt: new Date().toISOString() });
    return;
  }
  const file = localFile(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function clearArtifact(key: ArtifactKey): Promise<void> {
  const definition = definitions[key];
  if (livePersistence()) {
    await writeStorageObject(definition.file, { id: definition.id, title: definition.title, cleared: true, clearedAt: new Date().toISOString() });
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

export async function persistStructuredRecord(collection: string, id: string, value: unknown): Promise<void> {
  const current = await readArtifact<Record<string, { collection: string; id: string; value: unknown; updatedAt: string }>>("structuredRecords") ?? {};
  current[`${collection}:${id}`] = { collection, id, value, updatedAt: new Date().toISOString() };
  await writeArtifact("structuredRecords", current);
}
