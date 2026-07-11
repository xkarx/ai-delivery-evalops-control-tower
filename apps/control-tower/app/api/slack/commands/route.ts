import { verifySlackWebhook } from "@dailycart/connectors";
import { NextResponse } from "next/server";
import { executeOperatorCommand } from "@/lib/operator-command";
import { createConnectorSuite } from "@dailycart/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (process.env.INTEGRATION_MODE === "live" && !verifySlackWebhook({ rawBody, signature: request.headers.get("x-slack-signature") ?? undefined, timestamp: request.headers.get("x-slack-request-timestamp") ?? undefined, signingSecret: process.env.SLACK_SIGNING_SECRET ?? "" })) {
    return NextResponse.json({ ok: false, reply: "Invalid Slack signature." }, { status: 401 });
  }
  const fields = new URLSearchParams(rawBody);
  const command = fields.get("text") ?? fields.get("command") ?? "";
  const result = await executeOperatorCommand(command, request.url);
  if (process.env.INTEGRATION_MODE === "live" && fields.get("channel_id")) {
    try {
      await createConnectorSuite({ env: process.env }).chat.postMessage({ channel: fields.get("channel_id") ?? undefined, text: result.reply, threadId: fields.get("thread_ts") ?? undefined, metadata: { source: "dailycart-slack-command", command } });
    } catch {
      // Return the command result even when Slack cannot post the follow-up.
    }
  }
  return NextResponse.json({ response_type: "in_channel", text: result.reply, ...result });
}
