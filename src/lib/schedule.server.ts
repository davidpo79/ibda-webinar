import { sql } from "./db.server";

export type SessionType = "open" | "core" | "premium";

export type Session = {
  id: string;
  type: SessionType;
  key: string | null;
  title: string;
  starts_at: string;
  sort_order: number;
};

export async function getNextOpenSession(): Promise<Session | null> {
  const rows = await sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order FROM sessions
    WHERE type = 'open' AND starts_at > now()
    ORDER BY starts_at ASC
    LIMIT 1
  `;
  if (rows[0]) return rows[0];
  // Fallback: no future cohort scheduled yet — show the most recent one
  // rather than nothing, so the site never renders with a missing date.
  const fallback = await sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order FROM sessions
    WHERE type = 'open'
    ORDER BY starts_at DESC
    LIMIT 1
  `;
  return fallback[0] ?? null;
}

export async function getSessionByKey(key: string): Promise<Session | null> {
  const rows = await sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order FROM sessions WHERE key = ${key}
  `;
  return rows[0] ?? null;
}

export async function getSessionsByType(type: SessionType): Promise<Session[]> {
  return sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order FROM sessions
    WHERE type = ${type}
    ORDER BY sort_order ASC, starts_at ASC
  `;
}

export async function getAllSessions(): Promise<Session[]> {
  return sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order FROM sessions
    ORDER BY type ASC, sort_order ASC, starts_at ASC
  `;
}

export async function updateSessionDate(id: string, startsAt: string): Promise<void> {
  await sql()`
    UPDATE sessions SET starts_at = ${startsAt}, updated_at = now() WHERE id = ${id}
  `;
}

export async function createOpenSession(title: string, startsAt: string): Promise<Session> {
  const rows = await sql()<Session[]>`
    INSERT INTO sessions (type, key, title, starts_at, sort_order)
    VALUES ('open', NULL, ${title}, ${startsAt}, 0)
    RETURNING id, type, key, title, starts_at, sort_order
  `;
  return rows[0];
}
