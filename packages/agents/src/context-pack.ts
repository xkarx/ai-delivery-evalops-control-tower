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
}
