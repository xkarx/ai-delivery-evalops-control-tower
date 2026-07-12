import path from "node:path";
import { loadCompanyContextPack } from "@dailycart/agents";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pack = await loadCompanyContextPack(path.resolve(process.cwd(), "../.."), { expectedVersion: "1.0.0" });
    if (new Set(pack.evidenceIds).size !== pack.evidenceIds.length) throw new Error("Duplicate evidence identifiers were found.");
    return NextResponse.json({ ok: true, contextPackId: pack.version, evidenceCount: pack.evidenceIds.length, categoryCount: pack.categories.length, message: `${pack.evidenceIds.length} evidence references validated across ${pack.categories.length} categories.` });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Company context validation failed.", detail: error instanceof Error ? error.message : "Invalid context pack." }, { status: 500 });
  }
}
