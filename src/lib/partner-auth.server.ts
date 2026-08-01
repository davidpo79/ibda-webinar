import { createHmac, timingSafeEqual } from "node:crypto";

// Auth for the shared retainer page at /partner. Deliberately separate from
// the admin panel's auth (src/lib/admin-auth.server.ts): a different cookie,
// a different secret, and two named users instead of one shared password —
// so an admin session grants nothing here and vice versa.

const COOKIE_NAME = "ibda_partner_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type PartnerRole = "editor" | "viewer";
export type PartnerUser = { username: string; role: PartnerRole; displayName: string };

// Usernames are fixed in code; only the passwords live in the environment.
// The role follows from who you are: David logs the work, Yifat reads it.
const USERS: Record<string, { role: PartnerRole; displayName: string; passwordEnv: string }> = {
  david: { role: "editor", displayName: "דוד", passwordEnv: "PARTNER_DAVID_PASSWORD" },
  yifat: { role: "viewer", displayName: "יפעת", passwordEnv: "PARTNER_YIFAT_PASSWORD" },
};

function sessionSecret(): string {
  const s = process.env.PARTNER_SESSION_SECRET;
  if (!s) throw new Error("PARTNER_SESSION_SECRET is not configured");
  return s.trim();
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

// Compares HMAC digests (always 32 bytes) rather than the raw strings:
// timingSafeEqual throws on a length mismatch, and the early return that
// would require leaks the real password's length through response timing
// before the constant-time compare ever runs. Trimmed on both sides because
// env-var UIs commonly append a trailing newline to a pasted value.
function constantTimeEquals(a: string, b: string): boolean {
  const digest = (s: string) => createHmac("sha256", "ibda-partner-pw-compare").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

// Returns null for both "no such user" and "wrong password" — the caller
// surfaces one generic message either way, so the form never reveals which
// usernames exist. Still runs a comparison against a dummy value for an
// unknown user, so response timing doesn't distinguish the two cases.
export function verifyPartnerCredentials(username: string, password: string): PartnerUser | null {
  const key = username.trim().toLowerCase();
  const entry = USERS[key];
  if (!entry) {
    constantTimeEquals(password.trim(), "no-such-user-placeholder");
    return null;
  }
  const expected = process.env[entry.passwordEnv]?.trim();
  if (!expected) {
    constantTimeEquals(password.trim(), "unconfigured-placeholder");
    return null;
  }
  if (!constantTimeEquals(password.trim(), expected)) return null;
  return { username: key, role: entry.role, displayName: entry.displayName };
}

export function createPartnerCookieValue(username: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${username}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

// Returns the user the cookie authenticates, or null if it's missing,
// malformed, tampered with, expired, or names a user that no longer exists.
// The role is re-derived from USERS rather than read out of the cookie, so
// a forged role can't be smuggled in even if signing were ever weakened.
export function readPartnerSession(value: string | undefined | null): PartnerUser | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [username, expiresAtRaw, signature] = parts;
  const payload = `${username}.${expiresAtRaw}`;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const entry = USERS[username];
  if (!entry) return null;
  return { username, role: entry.role, displayName: entry.displayName };
}

// Guards the automatic hour-sync endpoint, which is called by a script and
// so carries a bearer token instead of a session cookie.
export function verifySyncToken(token: string | undefined | null): boolean {
  const expected = process.env.RETAINER_SYNC_TOKEN?.trim();
  if (!expected || !token) return false;
  return constantTimeEquals(token.trim(), expected);
}

export const PARTNER_COOKIE_NAME = COOKIE_NAME;
