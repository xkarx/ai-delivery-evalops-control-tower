import { readFile } from "node:fs/promises";
import path from "node:path";
import { featureSchema, ticketSchema, type Feature, type Ticket } from "@dailycart/schemas";

async function readGenerated<T>(file: string, parse: (value: unknown) => T): Promise<T | undefined> {
  for (const candidate of [path.resolve(process.cwd(), "../../company/generated/product", file), path.resolve(process.cwd(), "company/generated/product", file)]) {
    try { return parse(JSON.parse(await readFile(candidate, "utf8"))); } catch { /* use the next candidate */ }
  }
  return undefined;
}

export async function loadDeliveryBacklog(): Promise<Ticket[]> {
  return (await readGenerated("backlog.json", (value) => ticketSchema.array().parse(value))) ?? [];
}

export async function loadDeliveryFeatures(): Promise<Feature[]> {
  return (await readGenerated("features.json", (value) => featureSchema.array().parse(value))) ?? [];
}

