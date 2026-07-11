import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, parse, resolve } from "node:path";

export interface GeneratedCompany {
  seed: number;
  scenario: string;
  generatedAt: string;
  counts: Record<string, number>;
  files: Map<string, string>;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)])
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderCsv(headers: readonly string[], rows: readonly Record<string, string | number | boolean | null>[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header] ?? null)).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function renderJsonLines(values: readonly unknown[]): string {
  return `${values.map((value) => JSON.stringify(sortValue(value))).join("\n")}\n`;
}

function assertSafeGeneratedPath(outputDirectory: string): string {
  const output = resolve(outputDirectory);
  const root = parse(output).root;
  const cwd = resolve(process.cwd());
  if (output === root || output === cwd || output === dirname(cwd) || basename(output) === "company") {
    throw new Error(`Refusing to replace unsafe output directory: ${output}`);
  }
  return output;
}

export async function writeGeneratedCompany(company: GeneratedCompany, outputDirectory: string): Promise<void> {
  const output = assertSafeGeneratedPath(outputDirectory);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  for (const [relativePath, content] of [...company.files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const target = resolve(output, relativePath);
    if (!target.startsWith(`${output}/`)) {
      throw new Error(`Generated path escapes output directory: ${relativePath}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}
