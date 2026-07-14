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
//
// Compares HMAC digests (always 32 bytes) rather than the raw strings —
// comparing raw buffers would need a length check before timingSafeEqual
// (it throws on mismatched lengths), and that early return leaks the real
// password's length via response timing before the constant-time compare
// ever runs.
export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;
  const digest = (s: string) => createHmac("sha256", "ibda-admin-pw-compare").update(s).digest();
  return timingSafeEqual(digest(password.trim()), digest(expected));
}

// Basic in-process brute-force guard on admin login — resets on redeploy,
// which is an acceptable tradeoff for a single-instance admin panel with no
// other rate limiting anywhere in the app.
type LoginAttemptState = { failures: number; windowStart: number; lockedUntil: number };
const loginAttempts = new Map<string, LoginAttemptState>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export function isLoginLocked(key: string): boolean {
  const state = loginAttempts.get(key);
  return Boolean(state?.lockedUntil && state.lockedUntil > Date.now());
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state || now - state.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  state.failures += 1;
  if (state.failures >= LOGIN_MAX_ATTEMPTS) {
    state.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
}

export function recordLoginSuccess(key: string): void {
  loginAttempts.delete(key);
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
