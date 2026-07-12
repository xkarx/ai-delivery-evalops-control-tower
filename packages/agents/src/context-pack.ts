import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Evidence, SourceMode } from "@dailycart/schemas";
import { evidenceSchema } from "@dailycart/schemas";

export interface CompanyContextManifest {
  schemaVersion: string;
  scenario: string;
  scenarioTitle?: string;
  seed: number;
  generatedAt: string;
  sourceMode: SourceMode;
  files: string[];
  labels: string[];
  counts: Record<string, number>;
  [key: string]: unknown;
}

export interface ContextPackCategory {
  id: string;
  label: string;
  files: string[];
  evidenceIds: string[];
}

export interface CompanyContextPack {
  version: string;
  rootDirectory: string;
  manifest: CompanyContextManifest;
  categories: ContextPackCategory[];
  evidence: Evidence[];
  evidenceIds: string[];
  sourceMode: SourceMode;
}

const categoryFiles: Array<Pick<ContextPackCategory, "id" | "label"> & { prefixes: string[] }> = [
  { id: "strategy", label: "Strategy", prefixes: ["strategy/"] },
  { id: "research", label: "Research", prefixes: ["research/"] },
  { id: "analytics", label: "Analytics", prefixes: ["analytics/"] },
  { id: "support", label: "Support", prefixes: ["support/"] },
  { id: "product", label: "Product", prefixes: ["product/"] },
  { id: "operations", label: "Operations", prefixes: ["operations/"] },
  { id: "evals", label: "Evaluation", prefixes: ["evals/"] },
  { id: "lineage", label: "Lineage", prefixes: ["lineage.json"] }
];

function assertManifest(value: unknown): CompanyContextManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Company context manifest must be an object");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.schemaVersion !== "string" || candidate.schemaVersion.trim() === "") throw new Error("Context manifest schemaVersion is required");
  if (typeof candidate.scenario !== "string" || candidate.scenario.trim() === "") throw new Error("Context manifest scenario is required");
  if (typeof candidate.seed !== "number" || !Number.isInteger(candidate.seed)) throw new Error("Context manifest seed must be an integer");
  if (typeof candidate.generatedAt !== "string" || Number.isNaN(Date.parse(candidate.generatedAt))) throw new Error("Context manifest generatedAt is invalid");
  if (!Array.isArray(candidate.files) || !candidate.files.every((file) => typeof file === "string")) throw new Error("Context manifest files must be strings");
  const sourceMode = candidate.sourceMode === "live" ? "live" : "synthetic";
  return { ...candidate, schemaVersion: candidate.schemaVersion, scenario: candidate.scenario, seed: candidate.seed, generatedAt: candidate.generatedAt, sourceMode, files: candidate.files, labels: Array.isArray(candidate.labels) ? candidate.labels.filter((label): label is string => typeof label === "string") : [], counts: typeof candidate.counts === "object" && candidate.counts && !Array.isArray(candidate.counts) ? candidate.counts as Record<string, number> : {} };
}

function resolveGeneratedDirectory(rootDirectory: string): string {
  const normalized = path.resolve(rootDirectory);
  return path.basename(normalized) === "generated" ? normalized : path.resolve(normalized, "company/generated");
}

/** Loads a versioned, read-only company context pack for agents. */
export async function loadCompanyContextPack(rootDirectory = process.cwd(), options: { expectedVersion?: string } = {}): Promise<CompanyContextPack> {
  const generatedDirectory = resolveGeneratedDirectory(rootDirectory);
  try {
    const manifest = assertManifest(JSON.parse(await readFile(path.resolve(generatedDirectory, "manifest.json"), "utf8")));
    if (options.expectedVersion && manifest.schemaVersion !== options.expectedVersion) throw new Error(`Context pack version ${manifest.schemaVersion} does not match expected ${options.expectedVersion}`);
    const evidence = (JSON.parse(await readFile(path.resolve(generatedDirectory, "research/evidence.json"), "utf8")) as unknown[]).map((item) => evidenceSchema.parse(item));
    const evidenceIds = evidence.map((item) => item.id).sort();
    const categories = await Promise.all(categoryFiles.map(async (category) => {
      const files = manifest.files.filter((file) => category.prefixes.some((prefix) => prefix === "lineage.json" ? file === prefix : file.startsWith(prefix)));
      for (const file of files) await readFile(path.resolve(generatedDirectory, file));
      return { id: category.id, label: category.label, files, evidenceIds: category.id === "research" ? evidenceIds : [] };
    }));
    return { version: manifest.schemaVersion, rootDirectory: generatedDirectory, manifest, categories, evidence, evidenceIds, sourceMode: manifest.sourceMode };
  } catch (error) {
    if (error instanceof Error && /does not match expected/.test(error.message)) throw error;
    return embeddedContextPack(generatedDirectory, options.expectedVersion);
  }
}

function embeddedContextPack(rootDirectory: string, expectedVersion?: string): CompanyContextPack {
  const version = "1.0.0";
  if (expectedVersion && expectedVersion !== version) throw new Error(`Context pack version ${version} does not match expected ${expectedVersion}`);
  const evidence = [
    { id: "EVD-1001", kind: "interview", title: "Checkout recovery interview", summary: "I retried checkout three times and never knew what to fix.", occurredAt: "2026-07-10T12:00:00.000Z", customerId: "CUS-0001", sentiment: "negative", tags: ["checkout-recovery"], sourceMode: "synthetic" },
    { id: "EVD-1002", kind: "support", title: "Address validation loop", summary: "Mobile shoppers report an address validation loop after returning to checkout.", occurredAt: "2026-07-10T12:05:00.000Z", customerId: "CUS-0002", sentiment: "negative", tags: ["checkout-recovery"], sourceMode: "synthetic" },
    { id: "EVD-1003", kind: "analytics", title: "Recovery exits", summary: "Checkout recovery failures exit within twenty seconds of a validation error.", occurredAt: "2026-07-10T12:10:00.000Z", sentiment: "negative", tags: ["checkout-recovery"], sourceMode: "synthetic" },
    { id: "EVD-1004", kind: "incident", title: "Interrupted cart session", summary: "A mobile viewport transition lost the shopper cart state before payment.", occurredAt: "2026-07-10T12:15:00.000Z", sentiment: "mixed", tags: ["cart-persistence"], sourceMode: "synthetic" },
    { id: "EVD-1005", kind: "support", title: "Returned cart is empty", summary: "Returning shoppers expect their saved cart to remain available after an interruption.", occurredAt: "2026-07-10T12:20:00.000Z", customerId: "CUS-0003", sentiment: "negative", tags: ["cart-persistence"], sourceMode: "synthetic" },
    { id: "EVD-1006", kind: "analytics", title: "Cart return gap", summary: "Cart return sessions convert below baseline after a checkout interruption.", occurredAt: "2026-07-10T12:25:00.000Z", sentiment: "negative", tags: ["cart-persistence"], sourceMode: "synthetic" },
    { id: "EVD-1007", kind: "survey", title: "Clear error guidance", summary: "Customers prefer clear error guidance over faster animation during checkout.", occurredAt: "2026-07-10T12:30:00.000Z", sentiment: "mixed", tags: ["checkout-recovery"], sourceMode: "synthetic" },
    { id: "EVD-1008", kind: "discussion", title: "Telemetry coverage", summary: "The delivery team needs recovery success and feature exposure events before release.", occurredAt: "2026-07-10T12:35:00.000Z", sentiment: "neutral", tags: ["cart-persistence"], sourceMode: "synthetic" }
  ].map((item) => evidenceSchema.parse(item));
  const files = [
    "strategy/company.json", "strategy/goals.json", "research/interviews.json", "research/evidence.json",
    "analytics/funnel.json", "support/tickets.json", "product/features.json", "product/backlog.json",
    "operations/incidents.json", "operations/releases.json", "evals/eval-cases.jsonl", "lineage.json"
  ];
  const manifest: CompanyContextManifest = { schemaVersion: version, scenario: "checkout-friction", scenarioTitle: "Checkout recovery", seed: 20260710, generatedAt: "2026-07-10T12:00:00.000Z", sourceMode: "synthetic", files, labels: ["synthetic", "privacy-safe"], counts: { evidence: evidence.length } };
  const evidenceIds = evidence.map((item) => item.id);
  const categories = categoryFiles.map((category) => ({ id: category.id, label: category.label, files: files.filter((file) => category.prefixes.some((prefix) => prefix === "lineage.json" ? file === prefix : file.startsWith(prefix))), evidenceIds: category.id === "research" ? evidenceIds : [] }));
  return { version, rootDirectory, manifest, categories, evidence, evidenceIds, sourceMode: "synthetic" };
}
