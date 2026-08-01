import { createFileRoute } from "@tanstack/react-router";

// Ingest endpoint for scripts/sync-hours.mjs. A Claude Code session measures
// its own active working time from the local session transcript and POSTs
// the per-day totals here, so the shared /partner page updates immediately
// with no git push and no local database access.
//
// Authenticated with a bearer token (RETAINER_SYNC_TOKEN) rather than the
// partner session cookie: the caller is a script, not a browser. Being
// bearer-authenticated and POST-only, it also can't be triggered by a link,
// form, or image tag from another site.
//
// Writes are idempotent — keyed on (session_id, worked_on) — so re-running
// the sync several times during one session updates that day's row with the
// newer measurement instead of appending duplicates.

type SyncDay = { date?: string; hours?: number; title?: string | null; details?: string | null };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function handlePost(request: Request) {
  const { verifySyncToken } = await import("@/lib/partner-auth.server");
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;
  if (!verifySyncToken(token)) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { sessionId?: string; days?: SyncDay[] };
  try {
    body = await request.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) return new Response("missing sessionId", { status: 400 });
  if (!Array.isArray(body.days)) return new Response("missing days[]", { status: 400 });
  // Bounded so a malformed caller can't ask for an unbounded write loop.
  if (body.days.length > 366) return new Response("too many days", { status: 400 });

  const { upsertSessionDay, getRetainerSummary, getRetainerStartDate } =
    await import("@/lib/retainer.server");

  // The clock was deliberately reset when the bank opened: the single manual
  // opening entry accounts for everything up to and including started_on.
  // A session transcript can still reach much further back (it survives for
  // as long as its container does), so anything on or before that date is
  // refused here rather than trusted from the caller. Enforced server-side
  // so no local flag, stale script, or other machine can backfill history.
  const cutoff = await getRetainerStartDate();

  const applied: { date: string; hours: number }[] = [];
  const skipped: string[] = [];
  for (const day of body.days) {
    const date = String(day.date ?? "").trim();
    const hours = Number(day.hours);
    // Skip rather than fail the whole batch: a day that rounds to zero is
    // normal (a session that barely touched a given date), not an error.
    if (!DATE_RE.test(date)) continue;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
    if (cutoff && date <= cutoff) {
      skipped.push(date);
      continue;
    }

    await upsertSessionDay({
      sessionId,
      workedOn: date,
      hours: Math.round(hours * 100) / 100,
      title: day.title?.toString().trim().slice(0, 200) || null,
      details: day.details?.toString().trim().slice(0, 2000) || null,
    });
    applied.push({ date, hours });
  }

  const summary = await getRetainerSummary();
  console.log("[sync-hours] applied", {
    sessionId,
    days: applied.length,
    skippedBeforeStart: skipped.length,
  });

  return jsonResponse({
    ok: true,
    applied,
    // Reported rather than silently dropped, so a caller can tell the
    // difference between "nothing to sync" and "refused as pre-reset".
    skippedBeforeStart: skipped,
    summary: {
      totalHours: summary.totalHours,
      hoursUsed: summary.hoursUsed,
      hoursRemaining: summary.hoursRemaining,
      percentUsed: Math.round(summary.percentUsed),
    },
  });
}

export const Route = createFileRoute("/api/partner/sync-hours")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePost(request),
    },
  },
});
