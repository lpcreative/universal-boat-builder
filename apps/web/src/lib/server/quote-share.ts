import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";

interface SharePayload {
  v: string;
  qid: string;
  exp: number;
}

function toBase64Url(value: Buffer | string): string {
  const encoded = Buffer.isBuffer(value) ? value.toString("base64") : Buffer.from(value, "utf8").toString("base64");
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function readShareSecret(): string {
  const secret = process.env.QUOTE_SHARE_SECRET?.trim();
  if (!secret) {
    throw new Error("QUOTE_SHARE_SECRET missing; configure it in apps/web/.env.local");
  }
  return secret;
}

function signPayload(payloadB64: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(payloadB64).digest();
  return toBase64Url(signature);
}

export function generateQuoteShareToken(args: { quoteId: string; expiresInDays?: number }): string {
  const quoteId = args.quoteId.trim();
  if (!quoteId) {
    throw new Error("quoteId is required to generate a share token");
  }

  const secret = readShareSecret();
  const expiresInDays = Number.isFinite(args.expiresInDays) ? Math.max(1, Math.floor(args.expiresInDays ?? 0)) : 30;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: SharePayload = {
    v: TOKEN_VERSION,
    qid: quoteId,
    exp: nowSeconds + expiresInDays * 24 * 60 * 60
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signatureB64 = signPayload(payloadB64, secret);
  return `${payloadB64}.${signatureB64}`;
}

export function verifyQuoteShareToken(token: string): { quoteId: string } | null {
  if (typeof token !== "string") {
    return null;
  }
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) {
    return null;
  }

  try {
    const secret = readShareSecret();
    const expectedSignatureB64 = signPayload(payloadB64, secret);
    const providedSignature = fromBase64Url(signatureB64);
    const expectedSignature = fromBase64Url(expectedSignatureB64);
    if (providedSignature.length !== expectedSignature.length) {
      return null;
    }
    if (!timingSafeEqual(providedSignature, expectedSignature)) {
      return null;
    }

    const payloadRaw = fromBase64Url(payloadB64).toString("utf8");
    const payload = JSON.parse(payloadRaw) as Partial<SharePayload>;
    if (payload.v !== TOKEN_VERSION) {
      return null;
    }
    if (typeof payload.qid !== "string" || payload.qid.length === 0) {
      return null;
    }
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return null;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      return null;
    }

    return { quoteId: payload.qid };
  } catch {
    return null;
  }
}
