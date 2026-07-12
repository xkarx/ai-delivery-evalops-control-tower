import { productEventSchema, type ProductEvent } from "@dailycart/schemas";
import { readArtifact } from "./durable-artifacts";

export async function loadProductEvents(): Promise<ProductEvent[]> {
  try {
    const events = await readArtifact<unknown[]>("productEvents") ?? [];
    return events.flatMap((event) => {
      try { return [productEventSchema.parse(event)]; } catch { return []; }
    });
  } catch { return []; }
}
