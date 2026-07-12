import { NextResponse } from "next/server";
import { executeOperatorCommand } from "@/lib/operator-command";
import { requireOperatorAccess } from "@/lib/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { command?: string };
  const result = await executeOperatorCommand(body.command ?? "", request.url);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
