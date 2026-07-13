import { getAction, latestAction, readActions } from "@/lib/workflow-actions";
import { readArtifact } from "@/lib/durable-artifacts";
import { requestSessionId } from "@/lib/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredWorkflow = { activeActionId?: string; workflow?: { phase?: string } };

export async function GET(request: Request): Promise<Response> {
  const sessionId = requestSessionId(request);
  if (!sessionId) return new Response("A signed demo session is required.", { status: 401 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let last = "";
      let closed = false;
      const close = () => { if (closed) return; closed = true; controller.close(); };
      request.signal.addEventListener("abort", close);
      for (let attempt = 0; attempt < 12 && !closed; attempt += 1) {
        const [stored, actions] = await Promise.all([
          readArtifact<StoredWorkflow>("workflow", sessionId),
          readActions(sessionId)
        ]);
        const action = stored?.activeActionId ? await getAction(stored.activeActionId, sessionId) : latestAction(actions, sessionId);
        const payload = JSON.stringify({ sessionId, phase: action?.phase ?? stored?.workflow?.phase ?? "not_started", actionId: action?.actionId, status: action?.status, progress: action?.progress, updatedAt: action?.updatedAt });
        if (payload !== last) {
          controller.enqueue(encoder.encode(`event: workflow\ndata: ${payload}\n\n`));
          last = payload;
        } else controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        if (["succeeded", "failed", "waiting_human"].includes(action?.status ?? "")) break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      close();
    }
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
