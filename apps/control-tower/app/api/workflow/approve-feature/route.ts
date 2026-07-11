import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const response = await fetch(new URL("/api/workflow/run", request.url), { method: "POST", headers: { "x-dailycart-feature-approved": "true" } });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
