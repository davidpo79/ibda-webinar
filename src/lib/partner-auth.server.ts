import { createHmac, timingSafeEqual, randomBytes, scryptSync, createHash } from "node:crypto";
import { sql } from "./db.server";

// Auth for the shared retainer page at /partner. Deliberately separate from
// the admin panel's auth (src/lib/admin-auth.server.ts): a different cookie,
// a different secret, and named users with roles instead of one shared
// password — so an admin session grants nothing here and vice versa.
//
// Credentials live in the partner_users table rather than in env vars, so a
// password can actually be reset at runtime. Until a user has ever reset
// theirs, password_hash is NULL and the original env var is accepted
// instead, which keeps the initial credentials working with no migration.

const COOKIE_NAME = "ibda_partner_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RESET_TTL_MS = 1000 * 60 * 30; // 30 minutes

export type PartnerRole = "editor" | "viewer";
export type PartnerUser = { username: string; role: PartnerRole; displayName: string };

type PartnerUserRow = {
  username: string;
  display_name: string;
  role: PartnerRole;
  email: string;
  password_hash: string | null;
  reset_token_hash: string | null;
  reset_expires_at: string | null;
};

// Bootstrap passwords, used only while a user has no password_hash yet.
const ENV_PASSWORD_BY_USER: Record<string, string> = {
  david: "PARTNER_DAVID_PASSWORD",
  yifat: "PARTNER_YIFAT_PASSWORD",
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
// would require leaks the compared value's length through response timing.
function constantTimeEquals(a: string, b: string): boolean {
  const digest = (s: string) => createHmac("sha256", "ibda-partner-pw-compare").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/* -------------------------- password hashing -------------------------- */

// scrypt from Node's own crypto — deliberately no new dependency. Stored as
// "scrypt$<salt>$<hash>" so the parameters travel with the value and a
// future change of cost factor stays verifiable against old hashes.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password.trim(), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password.trim(), salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* -------------------------- users -------------------------- */

async function findUser(username: string): Promise<PartnerUserRow | null> {
  const rows = await sql()<PartnerUserRow[]>`
    SELECT username, display_name, role, email, password_hash,
           reset_token_hash, reset_expires_at
    FROM partner_users WHERE username = ${username}
  `;
  return rows[0] ?? null;
}

// Returns null for both "no such user" and "wrong password" — the caller
// surfaces one generic message either way, so the form never reveals which
// usernames exist. A miss still runs a hash comparison so response timing
// doesn't distinguish the two cases.
export async function verifyPartnerCredentials(
  username: string,
  password: string,
): Promise<PartnerUser | null> {
  const key = username.trim().toLowerCase();
  const user = await findUser(key);
  if (!user) {
    constantTimeEquals(password.trim(), "no-such-user-placeholder");
    return null;
  }

  let ok = false;
  if (user.password_hash) {
    ok = verifyPasswordHash(password, user.password_hash);
  } else {
    // Never had a reset: fall back to the bootstrap env var.
    const envName = ENV_PASSWORD_BY_USER[key];
    const expected = envName ? process.env[envName]?.trim() : undefined;
    ok = expected ? constantTimeEquals(password.trim(), expected) : false;
  }
  if (!ok) return null;
  return { username: user.username, role: user.role, displayName: user.display_name };
}

/* -------------------------- reset tokens -------------------------- */

// Only the token's hash is stored, so a leaked database row can't be used
// to complete a reset. Returns the raw token (for the emailed link) plus
// the address to send it to, or null when the username doesn't exist —
// callers must still report success either way.
export async function createResetToken(
  username: string,
): Promise<{ token: string; email: string; displayName: string } | null> {
  const key = username.trim().toLowerCase();
  const user = await findUser(key);
  if (!user) return null;

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  await sql()`
    UPDATE partner_users
    SET reset_token_hash = ${tokenHash}, reset_expires_at = ${expiresAt}, updated_at = now()
    WHERE username = ${key}
  `;
  return { token, email: user.email, displayName: user.display_name };
}

// Consumes the token: on success the password is replaced and the token
// cleared in the same statement, so a link can never be used twice.
export async function consumeResetToken(token: string, newPassword: string): Promise<boolean> {
  const tokenHash = createHash("sha256").update(token.trim()).digest("hex");
  const rows = await sql()<{ username: string }[]>`
    UPDATE partner_users
    SET password_hash = ${hashPassword(newPassword)},
        reset_token_hash = NULL,
        reset_expires_at = NULL,
        updated_at = now()
    WHERE reset_token_hash = ${tokenHash} AND reset_expires_at > now()
    RETURNING username
  `;
  return rows.length > 0;
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  const tokenHash = createHash("sha256").update(token.trim()).digest("hex");
  const rows = await sql()<{ username: string }[]>`
    SELECT username FROM partner_users
    WHERE reset_token_hash = ${tokenHash} AND reset_expires_at > now()
  `;
  return rows.length > 0;
}

export async function getPartnerEmail(username: string): Promise<string | null> {
  const user = await findUser(username.trim().toLowerCase());
  return user?.email ?? null;
}

/* -------------------------- sessions -------------------------- */

export function createPartnerCookieValue(username: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${username}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

// Returns the user the cookie authenticates, or null if it's missing,
// malformed, tampered with, or expired. Kept synchronous (no database
// lookup) because it runs on every request; the role is re-derived from
// the signed username by the caller when it matters.
export function readPartnerSessionUsername(value: string | undefined | null): string | null {
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
  return username;
}

// The role is read from the database rather than carried in the cookie, so
// revoking or changing a role takes effect immediately and a forged role
// can't be smuggled in even if signing were ever weakened.
export async function readPartnerSession(
  value: string | undefined | null,
): Promise<PartnerUser | null> {
  const username = readPartnerSessionUsername(value);
  if (!username) return null;
  const user = await findUser(username);
  if (!user) return null;
  return { username: user.username, role: user.role, displayName: user.display_name };
}

/* -------------------------- sync token -------------------------- */

export function verifySyncToken(token: string | undefined | null): boolean {
  const expected = process.env.RETAINER_SYNC_TOKEN?.trim();
  if (!expected || !token) return false;
  return constantTimeEquals(token.trim(), expected);
}

export const PARTNER_COOKIE_NAME = COOKIE_NAME;
