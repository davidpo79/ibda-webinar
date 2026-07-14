import { sql } from "./db.server";

export type SessionType = "open" | "core" | "premium";

export type Session = {
  id: string;
  type: SessionType;
  key: string | null;
  title: string;
  starts_at: string;
  sort_order: number;
  zoom_url: string | null;
};

export async function getNextOpenSession(): Promise<Session | null> {
  const rows = await sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order, zoom_url FROM sessions
    WHERE type = 'open' AND starts_at > now()
    ORDER BY starts_at ASC
    LIMIT 1
  `;
  if (rows[0]) return rows[0];
  // Fallback: no future cohort scheduled yet — show the most recent one
  // rather than nothing, so the site never renders with a missing date.
  const fallback = await sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order, zoom_url FROM sessions
    WHERE type = 'open'
    ORDER BY starts_at DESC
    LIMIT 1
  `;
  return fallback[0] ?? null;
}

// A lesson/workshop key can now have several cohort rows (the admin can
// schedule a new future date without deleting the old one). "The" session
// for a key is always the soonest upcoming row sharing it, falling back to
// the most recent past one if none is upcoming — same rule as the open
// webinar already used before this generalized to every key.
function pickBestPerKey(rows: Session[]): Session[] {
  const now = Date.now();
  const groups = new Map<string, Session[]>();
  const order: string[] = [];
  for (const row of rows) {
    const groupKey = row.key ?? row.id;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      order.push(groupKey);
    }
    groups.get(groupKey)!.push(row);
  }
  return order.map((groupKey) => {
    const group = groups.get(groupKey)!;
    const upcoming = group
      .filter((s) => new Date(s.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    if (upcoming[0]) return upcoming[0];
    return group
      .slice()
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0];
  });
}

export async function getSessionByKey(key: string): Promise<Session | null> {
  const rows = await sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order, zoom_url FROM sessions WHERE key = ${key}
  `;
  return pickBestPerKey(rows)[0] ?? null;
}

export async function getSessionsByType(type: SessionType): Promise<Session[]> {
  const rows = await sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order, zoom_url FROM sessions
    WHERE type = ${type}
    ORDER BY sort_order ASC, starts_at ASC
  `;
  return pickBestPerKey(rows).sort((a, b) => a.sort_order - b.sort_order);
}

export async function getAllSessions(): Promise<Session[]> {
  return sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order, zoom_url FROM sessions
    ORDER BY type ASC, sort_order ASC, starts_at ASC
  `;
}

export async function updateSessionDate(id: string, startsAt: string): Promise<void> {
  await sql()`
    UPDATE sessions SET starts_at = ${startsAt}, updated_at = now() WHERE id = ${id}
  `;
}

export async function createOpenSession(title: string, startsAt: string): Promise<Session> {
  // Inherit the fixed personal Zoom room from any prior open cohort — it's
  // a permanent meeting room reused every time, not a per-cohort link.
  const prior = await sql()<{ zoom_url: string | null }[]>`
    SELECT zoom_url FROM sessions WHERE type = 'open' AND zoom_url IS NOT NULL LIMIT 1
  `;
  const zoomUrl = prior[0]?.zoom_url ?? null;
  const rows = await sql()<Session[]>`
    INSERT INTO sessions (type, key, title, starts_at, sort_order, zoom_url)
    VALUES ('open', NULL, ${title}, ${startsAt}, 0, ${zoomUrl})
    RETURNING id, type, key, title, starts_at, sort_order, zoom_url
  `;
  return rows[0];
}

// Schedules a new future cohort for an existing core lesson or premium
// workshop, inheriting its type/title/sort_order/zoom_url from the most
// recent existing row with that key — the admin only picks the new date.
export async function createSessionCohort(key: string, startsAt: string): Promise<Session> {
  const template = await sql()<Session[]>`
    SELECT id, type, key, title, starts_at, sort_order, zoom_url FROM sessions
    WHERE key = ${key}
    ORDER BY starts_at DESC
    LIMIT 1
  `;
  if (!template[0]) throw new Error(`Unknown session key: ${key}`);
  const { type, title, sort_order, zoom_url } = template[0];
  const rows = await sql()<Session[]>`
    INSERT INTO sessions (type, key, title, starts_at, sort_order, zoom_url)
    VALUES (${type}, ${key}, ${title}, ${startsAt}, ${sort_order}, ${zoom_url})
    RETURNING id, type, key, title, starts_at, sort_order, zoom_url
  `;
  return rows[0];
}

// Packages whose welcome email lists multiple sessions (vs. a single one).
export type PackageSessions =
  | { kind: "single"; session: Session | null }
  | { kind: "list"; sessions: Session[]; anchor: Session | null };

// Resolves which session(s) a given package_id refers to, for building
// email content and for scheduling reminders. `coreSingleLessonIndex` (1-9)
// disambiguates the `core_single` package, matching the lesson the buyer
// picked at registration time.
export async function resolvePackageSessions(
  packageId: string,
  coreSingleLessonIndex?: number | null,
): Promise<PackageSessions> {
  if (packageId === "open") {
    return { kind: "single", session: await getNextOpenSession() };
  }
  if (packageId === "core_single") {
    const idx =
      coreSingleLessonIndex && coreSingleLessonIndex >= 1 && coreSingleLessonIndex <= 9
        ? coreSingleLessonIndex
        : 1;
    return { kind: "single", session: await getSessionByKey(`core_${idx}`) };
  }
  if (packageId === "core_full") {
    const sessions = await getSessionsByType("core");
    return { kind: "list", sessions, anchor: earliestOf(sessions) };
  }
  if (packageId === "premium_bundle") {
    const [core, premium] = await Promise.all([
      getSessionsByType("core"),
      getSessionsByType("premium"),
    ]);
    const sessions = [...core, ...premium];
    return { kind: "list", sessions, anchor: earliestOf(sessions) };
  }
  // premium_ai, premium_registration, premium_litigation, premium_partnership
  return { kind: "single", session: await getSessionByKey(packageId) };
}

function earliestOf(sessions: Session[]): Session | null {
  if (sessions.length === 0) return null;
  return sessions.reduce((a, b) => (new Date(a.starts_at) < new Date(b.starts_at) ? a : b));
}
