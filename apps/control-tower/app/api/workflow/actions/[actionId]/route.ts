import { NextResponse } from "next/server";
import { getAction } from "@/lib/workflow-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ actionId: string }> }): Promise<Response> {
  const { actionId } = await context.params;
  const action = await getAction(actionId);
  return action ? NextResponse.json({ ok: true, action }) : NextResponse.json({ ok: false, message: "Workflow action was not found." }, { status: 404 });
}
