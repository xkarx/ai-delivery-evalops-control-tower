import { NextResponse } from "next/server";
import { loadDemoState } from "@/lib/load-demo-state";
import { readArtifact } from "@/lib/durable-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await loadDemoState();
  const workflow = await readArtifact<Record<string, unknown>>("workflow");
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), workflow, features: data.features, decisions: data.decisions, approvals: data.approvals, runs: data.runs, campaigns: data.campaigns, deployments: data.deployments, incidents: data.incidents, lineage: data.lineage }, null, 2);
  return new NextResponse(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=dailycart-lineage-evidence.json" } });
}
