import { NextResponse } from "next/server";
import { readArtifact } from "@/lib/durable-artifacts";
import { requestSessionId } from "@/lib/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Build = { featureId: string; deploymentId: string; externalDeploymentId?: string; deploymentUrl: string; commitSha: string; sourceMode: string };

export async function GET(request: Request): Promise<Response> {
  try {
    const sessionId = requestSessionId(request);
    if (!sessionId) return NextResponse.json({ ok: false, message: "An active demo session is required." }, { status: 409 });
    const preview = await readArtifact<{ builds?: Build[] }>("workflowPreview", sessionId);
    const builds = preview?.builds ?? [];
    if (!builds.length) return NextResponse.json({ ok: false, message: "No preview deployments exist." }, { status: 404 });
    if (process.env.INTEGRATION_MODE !== "live") return NextResponse.json({ ok: true, statuses: builds.map((build) => ({ featureId: build.featureId, deploymentId: build.deploymentId, externalDeploymentId: build.externalDeploymentId, state: "READY", url: build.deploymentUrl, commitSha: build.commitSha, checkedAt: new Date().toISOString() })) });
    const token = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!token || !projectId) throw new Error("Vercel deployment status credentials are missing.");
    const response = await fetch(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=100`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Vercel deployment status returned HTTP ${response.status}.`);
    const payload = await response.json() as { deployments?: Array<{ uid: string; url?: string; state?: string; readyState?: string }> };
    const statuses = builds.map((build) => {
      const match = payload.deployments?.find((item) => item.uid === build.externalDeploymentId || (item.url && `https://${item.url}` === build.deploymentUrl));
      const state = (match?.readyState ?? match?.state ?? "QUEUED").toUpperCase();
      return { featureId: build.featureId, deploymentId: build.deploymentId, externalDeploymentId: match?.uid ?? build.externalDeploymentId, state, url: build.deploymentUrl, commitSha: build.commitSha, checkedAt: new Date().toISOString() };
    });
    return NextResponse.json({ ok: true, statuses });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Preview status could not be read.", detail: error instanceof Error ? error.message : "Unexpected Vercel status error." }, { status: 502 });
  }
}
