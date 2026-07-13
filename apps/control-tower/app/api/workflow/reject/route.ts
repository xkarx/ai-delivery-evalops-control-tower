import { NextResponse } from "next/server";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { loadDemoState } from "@/lib/load-demo-state";
import { requestSessionId } from "@/lib/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireOperatorAccess(); if (denied) return denied;
  const sessionId = requestSessionId(request);
  if (!sessionId) return NextResponse.json({ ok: false, message: "An active demo session is required." }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { approvalId?: string; reviewer?: string; rationale?: string };
  if (!body.approvalId || !body.rationale?.trim()) return NextResponse.json({ ok: false, message: "Approval ID and rationale are required." }, { status: 400 });
  const data = await loadDemoState(sessionId);
  const found = data.approvals.some((approval) => approval.id === body.approvalId);
  if (!found) return NextResponse.json({ ok: false, message: "Approval was not found." }, { status: 404 });
  const at = new Date().toISOString();
  await writeArtifact("demoState", { ...data, approvals: data.approvals.map((approval) => approval.id === body.approvalId ? { ...approval, status: "rejected", reviewer: body.reviewer ?? "operator", rationale: body.rationale, resolvedAt: at } : approval), activity: [{ at, type: "approval", title: "Human decision rejected", detail: `${body.approvalId} rejected: ${body.rationale}`, entityId: body.approvalId }, ...data.activity] }, sessionId);
  const workflow = await readArtifact<Record<string, unknown>>("workflow", sessionId);
  if (workflow) await writeArtifact("workflow", { ...workflow, phase: "blocked", rejectedApprovalId: body.approvalId, rejectedAt: at }, sessionId);
  return NextResponse.json({ ok: true, approvalId: body.approvalId, status: "rejected" });
}
