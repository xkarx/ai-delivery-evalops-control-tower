import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE = "dailycart_operator_session";

export function configuredOperatorPasscode(): boolean { return Boolean(process.env.DAILYCART_OPERATOR_PASSCODE?.trim()); }
export async function isOperatorAuthorized(): Promise<boolean> {
  if (process.env.INTEGRATION_MODE !== "live") return true;
  const expected = process.env.DAILYCART_OPERATOR_PASSCODE?.trim();
  if (!expected) return false;
  return (await cookies()).get(COOKIE)?.value === expected;
}
export async function requireOperatorAccess(): Promise<NextResponse | undefined> {
  if (await isOperatorAuthorized()) return undefined;
  return NextResponse.json({ ok: false, code: "OPERATOR_AUTH_REQUIRED", message: "Unlock live actions with the operator passcode before using provider writes or model credits." }, { status: 401 });
}
export function operatorSessionResponse(payload: Record<string, unknown>, passcode: string): NextResponse {
  const response = NextResponse.json(payload);
  response.cookies.set(COOKIE, passcode, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
  return response;
}
