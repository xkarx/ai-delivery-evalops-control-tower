import { createHmac, timingSafeEqual } from "node:crypto";

function equalHex(expectedHex: string, suppliedHex: string): boolean {
  if (!/^[a-f\d]+$/i.test(expectedHex) || !/^[a-f\d]+$/i.test(suppliedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const supplied = Buffer.from(suppliedHex, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function verifyHmacSha256(body: string | Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const supplied = signature.replace(/^sha256=/i, "");
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return equalHex(expected, supplied);
}

export function verifyGitHubWebhook(body: string | Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  return verifyHmacSha256(body, signatureHeader, secret);
}

export interface SlackVerificationInput {
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
  signingSecret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}

export function verifySlackWebhook(input: SlackVerificationInput): boolean {
  const { rawBody, signature, timestamp, signingSecret } = input;
  if (!signature?.startsWith("v0=") || !timestamp || !/^\d+$/.test(timestamp) || !signingSecret) return false;
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  if (Math.abs(nowSeconds - Number(timestamp)) > (input.toleranceSeconds ?? 300)) return false;
  const expected = createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
  return equalHex(expected, signature.slice(3));
}

export interface LinearVerificationInput {
  rawBody: string;
  signature: string | undefined;
  signingSecret: string;
  webhookTimestampMs?: number;
  nowMs?: number;
  toleranceMs?: number;
}

export function verifyLinearWebhook(input: LinearVerificationInput): boolean {
  if (!verifyHmacSha256(input.rawBody, input.signature, input.signingSecret)) return false;
  let webhookTimestampMs = input.webhookTimestampMs;
  if (webhookTimestampMs === undefined) {
    try {
      const parsed = JSON.parse(input.rawBody) as { webhookTimestamp?: unknown };
      if (typeof parsed.webhookTimestamp === "number") webhookTimestampMs = parsed.webhookTimestamp;
    } catch {
      return false;
    }
  }
  if (webhookTimestampMs === undefined || !Number.isFinite(webhookTimestampMs)) return false;
  return Math.abs((input.nowMs ?? Date.now()) - webhookTimestampMs) <= (input.toleranceMs ?? 60_000);
}
