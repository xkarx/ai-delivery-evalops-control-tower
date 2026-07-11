import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  decisionSchema,
  evalCaseSchema,
  evidenceSchema,
  featureSchema,
  productEventSchema,
  ticketSchema
} from "../packages/schemas/src/index";

type JsonRecord = Record<string, unknown>;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_COMPANY_DIRECTORY = resolve(REPO_ROOT, "company/generated");

const REQUIRED_FILES = [
  "manifest.json",
  "strategy/company-overview.md",
  "strategy/product-strategy.md",
  "strategy/quarterly-goals.json",
  "customers/personas.json",
  "customers/customers.json",
  "research/interviews.json",
  "research/evidence.json",
  "research/surveys.json",
  "research/feature-requests.json",
  "research/slack-threads.json",
  "support/support-tickets.json",
  "support/bugs.json",
  "analytics/event-schema.json",
  "analytics/product-events.csv",
  "analytics/baseline-funnel.csv",
  "analytics/experiments.json",
  "product/features.json",
  "product/backlog.json",
  "product/decisions.json",
  "product/roadmap.md",
  "operations/releases.json",
  "operations/incidents.json",
  "evals/eval-cases.jsonl",
  "evals/rubric.md",
  "lineage.json"
] as const;

const MINIMUMS: Record<string, number> = {
  personas: 5,
  customers: 50,
  interviews: 8,
  supportTickets: 30,
  featureRequests: 20,
  bugs: 15,
  slackThreads: 8,
  surveys: 10,
  backlogItems: 25,
  decisions: 5,
  releases: 5,
  incidents: 3,
  experiments: 3,
  evalCases: 30
};

export class CompanyValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Synthetic company validation failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}:\n- ${issues.join("\n- ")}`);
    this.name = "CompanyValidationError";
    this.issues = issues;
  }
}

export interface CompanyValidationReport {
  directory: string;
  seed: number;
  scenario: string;
  files: number;
  counts: Record<string, number>;
  evidenceLinks: number;
  lineageEdges: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordArray(value: unknown, path: string, issues: string[]): JsonRecord[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} must contain a JSON array`);
    return [];
  }
  const records: JsonRecord[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push(`${path}[${index}] must be a JSON object`);
    } else {
      records.push(item);
    }
  });
  return records;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function readJson(path: string, issues: string[]): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    issues.push(`${relative(process.cwd(), path)} is missing or invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function readJsonLines(path: string, issues: string[]): Promise<JsonRecord[]> {
  try {
    const content = await readFile(path, "utf8");
    const result: JsonRecord[] = [];
    content.split(/\r?\n/).forEach((line, index) => {
      if (line.trim() === "") return;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (!isRecord(parsed)) {
          issues.push(`${relative(process.cwd(), path)}:${index + 1} must be a JSON object`);
        } else {
          result.push(parsed);
        }
      } catch (error) {
        issues.push(`${relative(process.cwd(), path)}:${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return result;
  } catch (error) {
    issues.push(`${relative(process.cwd(), path)} is missing: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function parseCsv(content: string): JsonRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((entry) => entry !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [headers = [], ...values] = rows;
  return values.map((entries) => Object.fromEntries(headers.map((header, index) => [header, entries[index] ?? ""])));
}

async function readCsv(path: string, issues: string[]): Promise<JsonRecord[]> {
  try {
    return parseCsv(await readFile(path, "utf8"));
  } catch (error) {
    issues.push(`${relative(process.cwd(), path)} is missing or invalid CSV: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(relative(directory, path));
    }
  }
  await visit(directory);
  return output.sort();
}

function schemaIssues(name: string, result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }, issues: string[]): void {
  if (result.success || !result.error) return;
  for (const issue of result.error.issues) {
    issues.push(`${name}${issue.path.length ? `.${issue.path.join(".")}` : ""}: ${issue.message}`);
  }
}

function checkReference(source: string, field: string, value: unknown, targets: Set<string>, issues: string[]): void {
  if (typeof value !== "string") {
    issues.push(`${source}.${field} must be a string reference`);
  } else if (!targets.has(value)) {
    issues.push(`${source}.${field} references unknown ID ${value}`);
  }
}

function checkReferenceList(source: string, field: string, value: unknown, targets: Set<string>, issues: string[], requireOne = false): void {
  if (!Array.isArray(value)) {
    issues.push(`${source}.${field} must be an array of references`);
    return;
  }
  if (requireOne && value.length === 0) issues.push(`${source}.${field} must contain at least one reference`);
  value.forEach((reference, index) => checkReference(source, `${field}[${index}]`, reference, targets, issues));
}

function registerIds(name: string, records: JsonRecord[], globalIds: Map<string, string>, issues: string[]): Set<string> {
  const ids = new Set<string>();
  records.forEach((record, index) => {
    const id = record.id;
    if (typeof id !== "string") {
      issues.push(`${name}[${index}].id must be a string`);
      return;
    }
    if (ids.has(id)) issues.push(`${name} contains duplicate ID ${id}`);
    const existing = globalIds.get(id);
    if (existing) issues.push(`${id} is used as a primary ID by both ${existing} and ${name}`);
    ids.add(id);
    globalIds.set(id, name);
  });
  return ids;
}

function checkTimestamps(value: unknown, path: string, generatedAt: number, issues: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => checkTimestamps(child, `${path}[${index}]`, generatedAt, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if ((key.endsWith("At") || key === "at") && child !== null) {
      if (typeof child !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(child)) {
        issues.push(`${childPath} must be an ISO-8601 UTC timestamp with millisecond precision`);
      } else if (Date.parse(child) > generatedAt) {
        issues.push(`${childPath} occurs after manifest.generatedAt`);
      }
    }
    checkTimestamps(child, childPath, generatedAt, issues);
  }
}

function validateMinimums(counts: Record<string, number>, issues: string[]): void {
  for (const [name, minimum] of Object.entries(MINIMUMS)) {
    const count = counts[name] ?? 0;
    if (count < minimum) issues.push(`${name} count ${count} is below required minimum ${minimum}`);
  }
}

export async function validateCompany(directory = DEFAULT_COMPANY_DIRECTORY): Promise<CompanyValidationReport> {
  const root = resolve(directory);
  const issues: string[] = [];
  let diskFiles: string[] = [];
  try {
    diskFiles = await listFiles(root);
  } catch (error) {
    throw new CompanyValidationError([`Cannot read generated company directory ${root}: ${error instanceof Error ? error.message : String(error)}`]);
  }
  for (const required of REQUIRED_FILES) {
    if (!diskFiles.includes(required)) issues.push(`Missing required file ${required}`);
  }

  const [
    manifestValue,
    goalsValue,
    personasValue,
    customersValue,
    interviewsValue,
    evidenceValue,
    surveysValue,
    requestsValue,
    slackValue,
    supportValue,
    bugsValue,
    eventSchemaValue,
    experimentsValue,
    featuresValue,
    backlogValue,
    decisionsValue,
    releasesValue,
    incidentsValue,
    lineageValue,
    evalCases,
    productEvents,
    funnel
  ] = await Promise.all([
    readJson(resolve(root, "manifest.json"), issues),
    readJson(resolve(root, "strategy/quarterly-goals.json"), issues),
    readJson(resolve(root, "customers/personas.json"), issues),
    readJson(resolve(root, "customers/customers.json"), issues),
    readJson(resolve(root, "research/interviews.json"), issues),
    readJson(resolve(root, "research/evidence.json"), issues),
    readJson(resolve(root, "research/surveys.json"), issues),
    readJson(resolve(root, "research/feature-requests.json"), issues),
    readJson(resolve(root, "research/slack-threads.json"), issues),
    readJson(resolve(root, "support/support-tickets.json"), issues),
    readJson(resolve(root, "support/bugs.json"), issues),
    readJson(resolve(root, "analytics/event-schema.json"), issues),
    readJson(resolve(root, "analytics/experiments.json"), issues),
    readJson(resolve(root, "product/features.json"), issues),
    readJson(resolve(root, "product/backlog.json"), issues),
    readJson(resolve(root, "product/decisions.json"), issues),
    readJson(resolve(root, "operations/releases.json"), issues),
    readJson(resolve(root, "operations/incidents.json"), issues),
    readJson(resolve(root, "lineage.json"), issues),
    readJsonLines(resolve(root, "evals/eval-cases.jsonl"), issues),
    readCsv(resolve(root, "analytics/product-events.csv"), issues),
    readCsv(resolve(root, "analytics/baseline-funnel.csv"), issues)
  ]);

  const manifest = isRecord(manifestValue) ? manifestValue : {};
  if (!isRecord(manifestValue)) issues.push("manifest.json must contain a JSON object");
  const goals = recordArray(goalsValue, "quarterly-goals.json", issues);
  const personas = recordArray(personasValue, "personas.json", issues);
  const customers = recordArray(customersValue, "customers.json", issues);
  const interviews = recordArray(interviewsValue, "interviews.json", issues);
  const evidence = recordArray(evidenceValue, "evidence.json", issues);
  const surveys = recordArray(surveysValue, "surveys.json", issues);
  const featureRequests = recordArray(requestsValue, "feature-requests.json", issues);
  const slackThreads = recordArray(slackValue, "slack-threads.json", issues);
  const supportTickets = recordArray(supportValue, "support-tickets.json", issues);
  const bugs = recordArray(bugsValue, "bugs.json", issues);
  const experiments = recordArray(experimentsValue, "experiments.json", issues);
  const features = recordArray(featuresValue, "features.json", issues);
  const backlog = recordArray(backlogValue, "backlog.json", issues);
  const decisions = recordArray(decisionsValue, "decisions.json", issues);
  const releases = recordArray(releasesValue, "releases.json", issues);
  const incidents = recordArray(incidentsValue, "incidents.json", issues);
  const lineage = recordArray(lineageValue, "lineage.json", issues);

  schemaIssues("evidence.json", evidenceSchema.array().safeParse(evidence), issues);
  schemaIssues("features.json", featureSchema.array().safeParse(features), issues);
  schemaIssues("backlog.json", ticketSchema.array().safeParse(backlog), issues);
  schemaIssues("decisions.json", decisionSchema.array().safeParse(decisions), issues);
  schemaIssues("eval-cases.jsonl", evalCaseSchema.array().safeParse(evalCases), issues);

  const globalIds = new Map<string, string>();
  registerIds("quarterly-goals", goals, globalIds, issues);
  const personaIds = registerIds("personas", personas, globalIds, issues);
  const customerIds = registerIds("customers", customers, globalIds, issues);
  registerIds("interviews", interviews, globalIds, issues);
  const evidenceIds = registerIds("evidence", evidence, globalIds, issues);
  registerIds("surveys", surveys, globalIds, issues);
  registerIds("feature-requests", featureRequests, globalIds, issues);
  registerIds("slack-threads", slackThreads, globalIds, issues);
  registerIds("support-tickets", supportTickets, globalIds, issues);
  registerIds("bugs", bugs, globalIds, issues);
  registerIds("experiments", experiments, globalIds, issues);
  const featureIds = registerIds("features", features, globalIds, issues);
  const ticketIds = registerIds("backlog", backlog, globalIds, issues);
  registerIds("decisions", decisions, globalIds, issues);
  registerIds("releases", releases, globalIds, issues);
  const incidentIds = registerIds("incidents", incidents, globalIds, issues);
  const evalCaseIds = registerIds("eval-cases", evalCases, globalIds, issues);

  customers.forEach((item, index) => checkReference(`customers[${index}]`, "personaId", item.personaId, personaIds, issues));
  evidence.forEach((item, index) => {
    if (item.customerId !== undefined) checkReference(`evidence[${index}]`, "customerId", item.customerId, customerIds, issues);
  });
  interviews.forEach((item, index) => {
    checkReference(`interviews[${index}]`, "customerId", item.customerId, customerIds, issues);
    checkReference(`interviews[${index}]`, "evidenceId", item.evidenceId, evidenceIds, issues);
    if (typeof item.transcriptPath === "string" && !diskFiles.includes(item.transcriptPath)) {
      issues.push(`interviews[${index}].transcriptPath references missing file ${item.transcriptPath}`);
    }
  });
  surveys.forEach((item, index) => {
    checkReference(`surveys[${index}]`, "customerId", item.customerId, customerIds, issues);
    checkReference(`surveys[${index}]`, "evidenceId", item.evidenceId, evidenceIds, issues);
  });
  for (const [name, records] of [["support-tickets", supportTickets], ["feature-requests", featureRequests]] as const) {
    records.forEach((item, index) => {
      checkReference(`${name}[${index}]`, "customerId", item.customerId, customerIds, issues);
      checkReference(`${name}[${index}]`, "evidenceId", item.evidenceId, evidenceIds, issues);
    });
  }
  bugs.forEach((item, index) => {
    checkReference(`bugs[${index}]`, "evidenceId", item.evidenceId, evidenceIds, issues);
    checkReferenceList(`bugs[${index}]`, "affectedCustomerIds", item.affectedCustomerIds, customerIds, issues, true);
  });
  slackThreads.forEach((item, index) => checkReference(`slack-threads[${index}]`, "evidenceId", item.evidenceId, evidenceIds, issues));
  experiments.forEach((item, index) => checkReference(`experiments[${index}]`, "evidenceId", item.evidenceId, evidenceIds, issues));
  features.forEach((item, index) => checkReferenceList(`features[${index}]`, "evidenceIds", item.evidenceIds, evidenceIds, issues, true));
  backlog.forEach((item, index) => {
    checkReference(`backlog[${index}]`, "featureId", item.featureId, featureIds, issues);
    checkReferenceList(`backlog[${index}]`, "dependsOn", item.dependsOn, ticketIds, issues);
  });
  decisions.forEach((item, index) => checkReference(`decisions[${index}]`, "featureId", item.featureId, featureIds, issues));
  releases.forEach((item, index) => {
    checkReferenceList(`releases[${index}]`, "featureIds", item.featureIds, featureIds, issues, true);
    checkReferenceList(`releases[${index}]`, "evidenceIds", item.evidenceIds, evidenceIds, issues, true);
  });
  incidents.forEach((item, index) => {
    checkReference(`incidents[${index}]`, "featureId", item.featureId, featureIds, issues);
    checkReference(`incidents[${index}]`, "evidenceId", item.evidenceId, evidenceIds, issues);
    checkReference(`incidents[${index}]`, "regressionCaseId", item.regressionCaseId, evalCaseIds, issues);
    if (typeof item.postmortemPath === "string" && !diskFiles.includes(item.postmortemPath)) {
      issues.push(`incidents[${index}].postmortemPath references missing file ${item.postmortemPath}`);
    }
  });

  evalCases.forEach((item, index) => {
    const input = isRecord(item.input) ? item.input : {};
    if (input.featureId !== undefined) checkReference(`eval-cases[${index}].input`, "featureId", input.featureId, featureIds, issues);
    if (input.ticketId !== undefined) checkReference(`eval-cases[${index}].input`, "ticketId", input.ticketId, ticketIds, issues);
    if (input.customerId !== undefined) checkReference(`eval-cases[${index}].input`, "customerId", input.customerId, customerIds, issues);
    if (input.incidentId !== undefined) checkReference(`eval-cases[${index}].input`, "incidentId", input.incidentId, incidentIds, issues);
    if (input.evidenceIds !== undefined) checkReferenceList(`eval-cases[${index}].input`, "evidenceIds", input.evidenceIds, evidenceIds, issues, true);
  });

  const allEntityIds = new Set(globalIds.keys());
  const lineageIds = new Set<string>();
  lineage.forEach((edge, index) => {
    const id = edge.id;
    if (typeof id !== "string") issues.push(`lineage[${index}].id must be a string`);
    else if (lineageIds.has(id)) issues.push(`lineage contains duplicate edge ID ${id}`);
    else lineageIds.add(id);
    checkReference(`lineage[${index}]`, "sourceId", edge.sourceId, allEntityIds, issues);
    checkReference(`lineage[${index}]`, "targetId", edge.targetId, allEntityIds, issues);
  });
  features.forEach((feature, featureIndex) => {
    for (const evidenceId of strings(feature.evidenceIds)) {
      const found = lineage.some((edge) => edge.sourceId === evidenceId && edge.targetId === feature.id && edge.relationship === "supports");
      if (!found) issues.push(`features[${featureIndex}] evidence ${evidenceId} has no supports lineage edge`);
    }
  });

  const eventNames = isRecord(eventSchemaValue) && isRecord(eventSchemaValue.events) ? new Set(Object.keys(eventSchemaValue.events)) : new Set<string>();
  if (eventNames.size < 8) issues.push("event-schema.json must define all eight product event types");
  const productEventIds = new Set<string>();
  productEvents.forEach((row, index) => {
    let properties: unknown = {};
    try {
      properties = JSON.parse(typeof row.properties === "string" ? row.properties : "{}") as unknown;
    } catch {
      issues.push(`product-events.csv row ${index + 2} has invalid JSON properties`);
    }
    const parsed = {
      id: row.id,
      event: row.event,
      customerId: row.customerId,
      timestamp: row.timestamp,
      properties,
      sourceMode: row.sourceMode
    };
    schemaIssues(`product-events.csv row ${index + 2}`, productEventSchema.safeParse(parsed), issues);
    if (typeof row.id === "string") {
      if (productEventIds.has(row.id)) issues.push(`product-events.csv contains duplicate ID ${row.id}`);
      productEventIds.add(row.id);
    }
    checkReference(`product-events.csv row ${index + 2}`, "customerId", row.customerId, customerIds, issues);
    if (typeof row.event === "string" && !eventNames.has(row.event)) issues.push(`product-events.csv row ${index + 2} uses undefined event ${row.event}`);
    if (row.event === "feature_exposed" && isRecord(properties)) {
      checkReference(`product-events.csv row ${index + 2}.properties`, "featureId", properties.featureId, featureIds, issues);
    }
  });

  let previousFunnelCount = Number.POSITIVE_INFINITY;
  funnel.forEach((row, index) => {
    const count = Number(row.count);
    if (!Number.isInteger(count) || count < 0) issues.push(`baseline-funnel.csv row ${index + 2} count must be a non-negative integer`);
    if (count > previousFunnelCount) issues.push(`baseline-funnel.csv row ${index + 2} increases instead of narrowing the funnel`);
    previousFunnelCount = count;
  });

  const counts: Record<string, number> = {
    personas: personas.length,
    customers: customers.length,
    interviews: interviews.length,
    supportTickets: supportTickets.length,
    featureRequests: featureRequests.length,
    bugs: bugs.length,
    slackThreads: slackThreads.length,
    surveys: surveys.length,
    backlogItems: backlog.length,
    decisions: decisions.length,
    releases: releases.length,
    incidents: incidents.length,
    experiments: experiments.length,
    evalCases: evalCases.length,
    evidence: evidence.length,
    features: features.length,
    productEvents: productEvents.length,
    lineageEdges: lineage.length
  };
  validateMinimums(counts, issues);

  if (manifest.sourceMode !== "synthetic") issues.push("manifest.sourceMode must be synthetic");
  if (!Number.isSafeInteger(manifest.seed)) issues.push("manifest.seed must be a safe integer");
  if (typeof manifest.scenario !== "string" || manifest.scenario.length < 3) issues.push("manifest.scenario must be present");
  const generatedAt = typeof manifest.generatedAt === "string" ? Date.parse(manifest.generatedAt) : Number.NaN;
  if (!Number.isFinite(generatedAt)) issues.push("manifest.generatedAt must be a valid timestamp");
  else {
    for (const [name, value] of [
      ["quarterly-goals", goalsValue],
      ["customers", customersValue],
      ["interviews", interviewsValue],
      ["evidence", evidenceValue],
      ["surveys", surveysValue],
      ["support-tickets", supportValue],
      ["feature-requests", requestsValue],
      ["bugs", bugsValue],
      ["slack-threads", slackValue],
      ["experiments", experimentsValue],
      ["decisions", decisionsValue],
      ["releases", releasesValue],
      ["incidents", incidentsValue],
      ["lineage", lineageValue]
    ] as const) checkTimestamps(value, name, generatedAt, issues);
  }

  if (isRecord(manifest.counts)) {
    for (const [name, actual] of Object.entries(counts)) {
      if (manifest.counts[name] !== actual) issues.push(`manifest.counts.${name} is ${String(manifest.counts[name])}, expected ${actual}`);
    }
  } else {
    issues.push("manifest.counts must be an object");
  }
  const declaredFiles = strings(manifest.files).sort();
  const actualManifestFiles = diskFiles.filter((path) => path !== "manifest.json").sort();
  if (JSON.stringify(declaredFiles) !== JSON.stringify(actualManifestFiles)) {
    issues.push("manifest.files does not exactly match generated files (excluding manifest.json)");
  }

  const noiseCount = evidence.filter((item) => strings(item.tags).includes("noisy")).length;
  const conflictCount = evidence.filter((item) => strings(item.tags).includes("conflict") || strings(item.tags).includes("ambiguous")).length;
  if (noiseCount < 5) issues.push(`Evidence has only ${noiseCount} noisy records; expected at least 5`);
  if (conflictCount < 5) issues.push(`Evidence has only ${conflictCount} conflicting or ambiguous records; expected at least 5`);

  for (const path of diskFiles.filter((entry) => entry.endsWith(".md"))) {
    const content = await readFile(resolve(root, path), "utf8");
    if (!content.includes("Synthetic demo data")) issues.push(`${path} is missing its synthetic-data label`);
  }

  if (issues.length > 0) throw new CompanyValidationError(issues);
  return {
    directory: root,
    seed: manifest.seed as number,
    scenario: manifest.scenario as string,
    files: diskFiles.length,
    counts,
    evidenceLinks: features.reduce((sum, feature) => sum + strings(feature.evidenceIds).length, 0),
    lineageEdges: lineage.length
  };
}

function parseArguments(args: string[]): string {
  let directory = process.env.COMPANY_OUTPUT_DIR ?? DEFAULT_COMPANY_DIRECTORY;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--output") {
      const value = args[index + 1];
      if (!value) throw new Error("--output requires a directory");
      directory = resolve(value);
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write("Usage: tsx scripts/validate-company.ts [--output <directory>]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return directory;
}

async function main(): Promise<void> {
  const report = await validateCompany(parseArguments(process.argv.slice(2)));
  process.stdout.write(`Validated ${report.files} files for ${report.scenario} (seed ${report.seed}); ${report.counts.evidence} evidence records, ${report.lineageEdges} lineage edges.\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
