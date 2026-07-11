import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCompanyDataset } from "./company/dataset";
import { writeGeneratedCompany, type GeneratedCompany } from "./company/io";
import { DEFAULT_SCENARIO, DEFAULT_SEED, SCENARIOS } from "./company/scenarios";
import type { CompanyValidationReport } from "./validate-company";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUTPUT_DIRECTORY = resolve(REPO_ROOT, "company/generated");

export interface GenerateCompanyOptions {
  seed?: number;
  scenario?: string;
  outputDirectory?: string;
  validate?: boolean;
}

export interface GenerateCompanyResult {
  company: GeneratedCompany;
  outputDirectory: string;
  validation?: CompanyValidationReport;
}

export async function generateCompany(options: GenerateCompanyOptions = {}): Promise<GenerateCompanyResult> {
  const seed = options.seed ?? DEFAULT_SEED;
  const scenario = options.scenario ?? DEFAULT_SCENARIO;
  const outputDirectory = resolve(options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY);
  const company = buildCompanyDataset(seed, scenario);
  await writeGeneratedCompany(company, outputDirectory);
  const validation = options.validate === false
    ? undefined
    : await import("./validate-company").then(({ validateCompany }) => validateCompany(outputDirectory));
  return { company, outputDirectory, validation };
}

interface CliOptions extends GenerateCompanyOptions {
  listScenarios?: boolean;
}

function parseArguments(args: string[]): CliOptions {
  const options: CliOptions = {
    seed: process.env.COMPANY_SEED ? Number(process.env.COMPANY_SEED) : DEFAULT_SEED,
    scenario: process.env.COMPANY_SCENARIO ?? DEFAULT_SCENARIO,
    outputDirectory: process.env.COMPANY_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIRECTORY,
    validate: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    const value = args[index + 1];
    if (argument === "--seed") {
      if (!value) throw new Error("--seed requires an integer");
      options.seed = Number(value);
      index += 1;
    } else if (argument === "--scenario") {
      if (!value) throw new Error("--scenario requires a scenario ID");
      options.scenario = value;
      index += 1;
    } else if (argument === "--output") {
      if (!value) throw new Error("--output requires a directory");
      options.outputDirectory = resolve(value);
      index += 1;
    } else if (argument === "--no-validate") {
      options.validate = false;
    } else if (argument === "--list-scenarios") {
      options.listScenarios = true;
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write("Usage: tsx scripts/generate-company.ts [--seed <integer>] [--scenario <id>] [--output <directory>] [--no-validate] [--list-scenarios]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!Number.isSafeInteger(options.seed)) throw new Error(`--seed must be a safe integer; received ${String(options.seed)}`);
  return options;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.listScenarios) {
    for (const scenario of Object.values(SCENARIOS)) process.stdout.write(`${scenario.id}\t${scenario.title}\n`);
    return;
  }
  const result = await generateCompany(options);
  process.stdout.write(`Generated DailyCart company data in ${result.outputDirectory} using scenario ${result.company.scenario}, seed ${result.company.seed}.\n`);
  if (result.validation) {
    process.stdout.write(`Validated ${result.validation.files} files, ${result.validation.counts.evidence} evidence records, and ${result.validation.lineageEdges} lineage edges.\n`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
