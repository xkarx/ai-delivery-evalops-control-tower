import { readFile } from "node:fs/promises";
import path from "node:path";
import { productEventSchema, type ProductEvent } from "@dailycart/schemas";

export async function loadProductEvents(): Promise<ProductEvent[]> {
  const root = path.resolve(process.cwd(), "../..");
  try {
    const raw = await readFile(path.resolve(root, "artifacts/product-events.jsonl"), "utf8");
    return raw.split("\n").filter(Boolean).flatMap((line) => {
      try { return [productEventSchema.parse(JSON.parse(line))]; } catch { return []; }
    });
  } catch { return []; }
}
