import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateCompany } from "../scripts/generate-company";
import { stableJson } from "../scripts/company/io";
import { validateCompany } from "../scripts/validate-company";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `dailycart-${name}-`));
  temporaryDirectories.push(directory);
  return directory;
}

async function snapshot(directory: string): Promise<Map<string, string>> {
  const output = new Map<string, string>();
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else output.set(relative(directory, path), await readFile(path, "utf8"));
    }
  }
  await visit(directory);
  return output;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("synthetic company generator", () => {
  it("writes byte-identical output for the same seed and scenario", async () => {
    const first = await temporaryDirectory("deterministic-a");
    const second = await temporaryDirectory("deterministic-b");

    await generateCompany({ seed: 7357, scenario: "checkout-friction", outputDirectory: first });
    await generateCompany({ seed: 7357, scenario: "checkout-friction", outputDirectory: second });

    expect(await snapshot(first)).toEqual(await snapshot(second));
  });

  it("changes evidence for another scenario without changing shared IDs", async () => {
    const checkout = await temporaryDirectory("scenario-checkout");
    const search = await temporaryDirectory("scenario-search");
    await generateCompany({ seed: 9191, scenario: "checkout-friction", outputDirectory: checkout });
    await generateCompany({ seed: 9191, scenario: "search-relevance", outputDirectory: search });

    const checkoutEvidenceText = await readFile(resolve(checkout, "research/evidence.json"), "utf8");
    const searchEvidenceText = await readFile(resolve(search, "research/evidence.json"), "utf8");
    const checkoutEvidence = JSON.parse(checkoutEvidenceText) as Array<{ id: string; tags: string[] }>;
    const searchEvidence = JSON.parse(searchEvidenceText) as Array<{ id: string; tags: string[] }>;

    expect(checkoutEvidenceText).not.toEqual(searchEvidenceText);
    expect(checkoutEvidence.map((item) => item.id)).toEqual(searchEvidence.map((item) => item.id));
    expect(checkoutEvidence.filter((item) => item.tags.includes("checkout_recovery")).length)
      .toBeGreaterThan(searchEvidence.filter((item) => item.tags.includes("checkout_recovery")).length);
    expect(searchEvidence.filter((item) => item.tags.includes("search_quality")).length)
      .toBeGreaterThan(checkoutEvidence.filter((item) => item.tags.includes("search_quality")).length);
  });

  it("meets every minimum and exposes all required formats", async () => {
    const output = await temporaryDirectory("minimums");
    await generateCompany({ seed: 20250301, scenario: "balanced-signals", outputDirectory: output });
    const report = await validateCompany(output);

    expect(report.counts).toMatchObject({
      personas: 5,
      customers: 50,
      interviews: 8,
      supportTickets: 30,
      surveys: 12,
      featureRequests: 20,
      bugs: 15,
      slackThreads: 8,
      backlogItems: 25,
      decisions: 5,
      releases: 5,
      incidents: 3,
      experiments: 3,
      evalCases: 36
    });
    const paths = [...(await snapshot(output)).keys()];
    expect(paths.some((path) => path.endsWith(".md"))).toBe(true);
    expect(paths.some((path) => path.endsWith(".json"))).toBe(true);
    expect(paths.some((path) => path.endsWith(".csv"))).toBe(true);
    expect(paths.some((path) => path.endsWith(".jsonl"))).toBe(true);
  });

  it("fails validation when a cross-file reference is invalid", async () => {
    const output = await temporaryDirectory("invalid-reference");
    await generateCompany({ seed: 44, scenario: "checkout-friction", outputDirectory: output });
    const customerPath = resolve(output, "customers/customers.json");
    const customers = JSON.parse(await readFile(customerPath, "utf8")) as Array<Record<string, unknown>>;
    customers[0]!.personaId = "PER-9999";
    await writeFile(customerPath, stableJson(customers), "utf8");

    await expect(validateCompany(output)).rejects.toThrow(/PER-9999/);
  });
});
