import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "ibda_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  const s = process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("ADMIN_PASSWORD is not configured");
  return s.trim();
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

// Trimmed on both sides — env var UIs (Railway included) commonly append a
// trailing newline/space when a value is pasted, which would otherwise make
// every login attempt fail on a length mismatch before comparison even runs.
export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;
  const a = Buffer.from(password.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createSessionCookieValue(): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${expiresAt}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function isValidSessionCookie(value: string | undefined | null): boolean {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;

export function parseCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
