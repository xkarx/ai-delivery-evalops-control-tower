import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "dailycart_operator_session";

export function configuredOperatorPasscode(): boolean { return Boolean(process.env.DAILYCART_OPERATOR_PASSCODE?.trim()); }
function sign(value: string, secret: string): string { return createHmac("sha256", secret).update(value).digest("base64url"); }
function sessionToken(secret: string): string {
  const expires = String(Date.now() + 8 * 60 * 60 * 1_000);
  return `${expires}.${sign(expires, secret)}`;
}
function validSession(value: string | undefined, secret: string): boolean {
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  const expected = sign(expires, secret);
  try { return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); } catch { return false; }
}
export async function isOperatorAuthorized(): Promise<boolean> {
  if (process.env.INTEGRATION_MODE !== "live") return true;
  const expected = process.env.DAILYCART_OPERATOR_PASSCODE?.trim();
  if (!expected) return false;
  return validSession((await cookies()).get(COOKIE)?.value, expected);
}
export async function requireOperatorAccess(): Promise<NextResponse | undefined> {
  if (await isOperatorAuthorized()) return undefined;
  const expected = process.env.DAILYCART_OPERATOR_PASSCODE?.trim();
  const supplied = (await headers()).get("authorization")?.replace(/^Bearer\s+/i, "");
  if (expected && supplied) {
    try { if (timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return undefined; } catch { /* Invalid service token length. */ }
  }
  return NextResponse.json({ ok: false, code: "OPERATOR_AUTH_REQUIRED", message: "Unlock live actions with the operator passcode before using provider writes or model credits." }, { status: 401 });
}
export async function requireOperatorOrService(request: Request): Promise<NextResponse | undefined> {
  const secret = process.env.SAMPLE_PRODUCT_TRAFFIC_TOKEN?.trim() || process.env.DAILYCART_OPERATOR_PASSCODE?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret && supplied === secret) return undefined;
  return requireOperatorAccess();
}
export function operatorSessionResponse(payload: Record<string, unknown>): NextResponse {
  const secret = process.env.DAILYCART_OPERATOR_PASSCODE?.trim();
  if (!secret) return NextResponse.json({ ok: false, message: "Operator access is not configured." }, { status: 503 });
  const response = NextResponse.json(payload);
  response.cookies.set(COOKIE, sessionToken(secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
  return response;
}
