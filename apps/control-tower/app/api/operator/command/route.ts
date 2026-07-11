import { NextResponse } from "next/server";
import { executeOperatorCommand } from "@/lib/operator-command";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { command?: string };
  const result = await executeOperatorCommand(body.command ?? "", request.url);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
