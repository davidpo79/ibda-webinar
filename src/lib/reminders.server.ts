import { sql } from "./db.server";
import { resolvePackageSessions, type Session, type SessionType } from "./schedule.server";
import { reminderDueAt } from "./format-date";
import { buildReminderEmail } from "./email-templates.server";
import { sendRawEmail } from "./resend.server";
import { getEmailSendPolicy, isAllowedSendTime } from "./email-policy.server";
import { runPriceIncreaseNoticeSweep } from "./pricing-notices.server";
import { getEmailOverrides } from "./email-content.server";
import { runSumitWebhookReconcileSweep } from "./sumit-reconcile.server";

// Populates registration_reminders row(s) for (registration, package),
// pointing at whatever session(s) currently anchor that package. Called
// immediately for the free "open" package (no payment gate), or once Sumit
// confirms payment for paid packages — never at raw form-submission time,
// since a paid package isn't confirmed until the payment actually clears.
//
// core_single bought as several distinct lessons gets one reminder row per
// lesson (each has its own date and its own Zoom link) rather than a single
// reminder for just the earliest one — every other package still only ever
// reminds once, anchored on its earliest session.
export async function scheduleReminder(
  registrationId: string,
  packageId: string,
  coreSingleLessonIndexes?: number[] | null,
): Promise<void> {
  if (packageId === "core_single" && (coreSingleLessonIndexes?.length ?? 0) > 1) {
    for (const idx of coreSingleLessonIndexes!) {
      const resolved = await resolvePackageSessions("core_single", [idx]);
      const session = resolved.kind === "single" ? resolved.session : null;
      if (!session) continue;
      await sql()`
        INSERT INTO registration_reminders (registration_id, package_id, session_id)
        VALUES (${registrationId}, ${packageId}, ${session.id})
        ON CONFLICT (registration_id, package_id, session_id) DO NOTHING
      `;
    }
    return;
  }

  const resolved = await resolvePackageSessions(packageId, coreSingleLessonIndexes);
  const anchor = resolved.kind === "single" ? resolved.session : resolved.anchor;
  if (!anchor) return;
  await sql()`
    INSERT INTO registration_reminders (registration_id, package_id, session_id)
    VALUES (${registrationId}, ${packageId}, ${anchor.id})
    ON CONFLICT (registration_id, package_id, session_id) DO NOTHING
  `;
}

type DueReminderRow = {
  id: string;
  registration_id: string;
  package_id: string;
  first_name: string;
  email: string;
  session_id: string;
  session_starts_at: string;
  session_title: string;
  session_type: SessionType;
  session_key: string | null;
  session_sort_order: number;
  session_zoom_url: string | null;
};

async function fetchPendingReminders(): Promise<DueReminderRow[]> {
  return sql()<DueReminderRow[]>`
    SELECT
      rr.id, rr.registration_id, rr.package_id,
      r.first_name, r.email,
      s.id AS session_id, s.starts_at AS session_starts_at, s.title AS session_title,
      s.type AS session_type, s.key AS session_key, s.sort_order AS session_sort_order,
      s.zoom_url AS session_zoom_url
    FROM registration_reminders rr
    JOIN registrations r ON r.id = rr.registration_id
    JOIN sessions s ON s.id = rr.session_id
    WHERE rr.sent_at IS NULL AND s.starts_at > now()
  `;
}

// Checks every not-yet-sent reminder and sends the ones whose "day before"
// threshold (per-package — see reminderDueAt) has passed. Safe to call
// repeatedly: sent_at is only set after a successful send, guarded by a
// WHERE ... AND sent_at IS NULL on the update, so an overlapping tick can't
// double-send the same row. Gated by the admin-configured send-time policy
// (Shabbat/holidays/allowed hours, see src/lib/email-policy.server.ts) — if
// sending isn't allowed right now, the whole sweep is skipped and retried
// next tick, so nothing is marked sent until it actually goes out.
export async function runReminderSweep(): Promise<{ checked: number; sent: number }> {
  const policy = await getEmailSendPolicy();
  if (!isAllowedSendTime(new Date(), policy)) {
    return { checked: 0, sent: 0 };
  }

  const pending = await fetchPendingReminders();
  const now = Date.now();
  const overrides = pending.length ? await getEmailOverrides() : {};
  let sent = 0;

  for (const row of pending) {
    if (reminderDueAt(row.session_starts_at, row.package_id).getTime() > now) continue;

    const session: Session = {
      id: row.session_id,
      type: row.session_type,
      key: row.session_key,
      title: row.session_title,
      starts_at: row.session_starts_at,
      sort_order: row.session_sort_order,
      zoom_url: row.session_zoom_url,
    };

    try {
      const { subject, html } = buildReminderEmail(
        row.package_id,
        row.first_name,
        session,
        row.email,
        overrides,
      );
      await sendRawEmail(row.email, subject, html);
      await sql()`
        UPDATE registration_reminders SET sent_at = now() WHERE id = ${row.id} AND sent_at IS NULL
      `;
      sent++;
    } catch (err) {
      console.error("[reminders] failed to send reminder", row.id, err);
    }
  }

  return { checked: pending.length, sent };
}

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let started = false;

// In-process scheduler (chosen over a separate Railway cron service) — a
// single setInterval ticking in the same long-running web process that
// already handles every request, running both the day-before reminder sweep
// and the price-increase-notice sweep. Idempotent: calling this more than
// once (e.g. from a hot-reloaded module) is a no-op after the first call.
export function startAutomationScheduler(): void {
  if (started) return;
  started = true;

  if (!process.env.DATABASE_URL || !process.env.RESEND_API_KEY) {
    console.warn("[automation] scheduler not started — DATABASE_URL or RESEND_API_KEY missing");
    return;
  }

  console.log(`[automation] scheduler started, sweeping every ${SWEEP_INTERVAL_MS / 60000} min`);

  const tick = async () => {
    try {
      const { checked, sent } = await runReminderSweep();
      console.log(`[reminders] sweep checked ${checked} pending, sent ${sent}`);
    } catch (err) {
      console.error("[reminders] sweep failed", err);
    }
    try {
      const { checked, sent } = await runPriceIncreaseNoticeSweep();
      console.log(`[pricing-notices] sweep checked ${checked} due, sent ${sent}`);
    } catch (err) {
      console.error("[pricing-notices] sweep failed", err);
    }
    try {
      const { scanned, recovered, errors } = await runSumitWebhookReconcileSweep();
      console.log(
        `[sumit-reconcile] sweep scanned ${scanned}, recovered ${recovered}, errors ${errors}`,
      );
    } catch (err) {
      console.error("[sumit-reconcile] sweep failed", err);
    }
  };

  tick();
  setInterval(tick, SWEEP_INTERVAL_MS);
}
