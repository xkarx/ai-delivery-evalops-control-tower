import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cookies } from "next/headers";
import { newSessionId, newWorkflowId } from "./workflow-actions";
import { readArtifact, writeArtifact } from "./durable-artifacts";

export const demoSessionCookie = "dailycart_demo_session";

export const executionModeSchema = z.enum(["showcase", "full_verification"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

export type DemoSession = {
  sessionId: string;
  workflowId: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  executionMode: ExecutionMode;
  archivedAt?: string;
};

function secret(): string {
  return process.env.DAILYCART_SESSION_SECRET ?? process.env.DAILYCART_OPERATOR_PASSCODE ?? "dailycart-local-session";
}

function signature(sessionId: string): string {
  return createHmac("sha256", secret()).update(sessionId).digest("base64url").slice(0, 32);
}

export function encodeSessionCookie(sessionId: string): string {
  return `${sessionId}.${signature(sessionId)}`;
}

export function decodeSessionCookie(value?: string | null): string | undefined {
  if (!value) return undefined;
  const [sessionId, provided] = decodeURIComponent(value).split(".");
  if (!sessionId || !provided || !/^SESSION-[A-Z0-9]+$/.test(sessionId)) return undefined;
  const expected = signature(sessionId);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return undefined;
  return sessionId;
}

export function requestSessionId(request: Request): string | undefined {
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)dailycart_demo_session=([^;]+)/)?.[1];
  const signedSession = decodeSessionCookie(raw);
  if (signedSession) return signedSession;

  // Session headers are reserved for authenticated background workers. Public
  // reads and browser requests must resolve identity from the signed cookie so
  // a caller cannot select another session by supplying an arbitrary header.
  const serviceSession = request.headers.get("x-dailycart-session-id");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const serviceSecrets = [
    process.env.WORKFLOW_SERVICE_TOKEN,
    process.env.INNGEST_SIGNING_KEY,
    process.env.DAILYCART_OPERATOR_PASSCODE
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  const serviceAuthorized = Boolean(supplied && serviceSecrets.some((value) => {
    try { return timingSafeEqual(Buffer.from(supplied), Buffer.from(value)); } catch { return false; }
  }));
  if (serviceAuthorized && serviceSession && /^SESSION-[A-Z0-9]+$/.test(serviceSession)) return serviceSession;
  return undefined;
}

export async function serverSessionId(): Promise<string | undefined> {
  const store = await cookies();
  return decodeSessionCookie(store.get(demoSessionCookie)?.value);
}

export async function createDemoSession(executionMode: ExecutionMode = "showcase"): Promise<DemoSession> {
  const now = new Date().toISOString();
  const session: DemoSession = { sessionId: newSessionId(), workflowId: newWorkflowId(), status: "active", createdAt: now, updatedAt: now, executionMode };
  await writeArtifact("structuredRecords", { [`demo_sessions:${session.sessionId}`]: { collection: "demo_sessions", id: session.sessionId, value: session, updatedAt: now } }, session.sessionId);
  return session;
}

export async function getDemoSession(sessionId: string): Promise<DemoSession | undefined> {
  const records = await readArtifact<Record<string, { value: DemoSession }>>("structuredRecords", sessionId);
  return records?.[`demo_sessions:${sessionId}`]?.value;
}

export async function archiveDemoSession(sessionId: string): Promise<DemoSession | undefined> {
  const current = await getDemoSession(sessionId);
  if (!current) return undefined;
  const now = new Date().toISOString();
  const archived = { ...current, status: "archived" as const, archivedAt: now, updatedAt: now };
  const records = await readArtifact<Record<string, { collection: string; id: string; value: unknown; updatedAt: string }>>("structuredRecords", sessionId) ?? {};
  records[`demo_sessions:${sessionId}`] = { collection: "demo_sessions", id: sessionId, value: archived, updatedAt: now };
  await writeArtifact("structuredRecords", records, sessionId);
  return archived;
}
