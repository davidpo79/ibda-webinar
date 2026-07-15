import { sql } from "./db.server";

const ISRAEL_TZ = "Asia/Jerusalem";

export type EmailSendPolicy = {
  blocked_weekdays: number[];
  allowed_hour_start: number;
  allowed_hour_end: number;
  blocked_dates: string[];
  // Saturday, alone among blocked weekdays, can reopen at a fixed Israel-time
  // hour instead of staying blocked for its full 24h — Shabbat safely ends
  // by 21:00 in Israel year-round, and without this a reminder due the
  // evening before a Sunday session has no window left to send in at all
  // before that session starts. null preserves the old full-day block.
  saturday_ends_hour: number | null;
};

const DEFAULT_POLICY: EmailSendPolicy = {
  blocked_weekdays: [6],
  allowed_hour_start: 8,
  allowed_hour_end: 21,
  blocked_dates: [],
  saturday_ends_hour: 21,
};

export async function getEmailSendPolicy(): Promise<EmailSendPolicy> {
  const rows = await sql()<EmailSendPolicy[]>`
    SELECT blocked_weekdays, allowed_hour_start, allowed_hour_end, blocked_dates, saturday_ends_hour
    FROM email_send_policy WHERE id = true
  `;
  return rows[0] ?? DEFAULT_POLICY;
}

export async function updateEmailSendPolicy(data: {
  blockedWeekdays: number[];
  allowedHourStart: number;
  allowedHourEnd: number;
  blockedDates: string[];
  saturdayEndsHour: number | null;
}): Promise<void> {
  await sql()`
    UPDATE email_send_policy SET
      blocked_weekdays = ${data.blockedWeekdays},
      allowed_hour_start = ${data.allowedHourStart},
      allowed_hour_end = ${data.allowedHourEnd},
      blocked_dates = ${data.blockedDates},
      saturday_ends_hour = ${data.saturdayEndsHour},
      updated_at = now()
    WHERE id = true
  `;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function israelParts(date: Date): { weekday: number; dateStr: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {} as Record<string, string>);
  return {
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour === "24" ? 0 : Number(parts.hour),
  };
}

// Whether the given instant falls inside the admin-configured sending
// window (Israel time) — used to gate every automated bulk email (day-before
// reminders, price-increase notices). Transactional emails triggered by a
// direct user action (registration confirmation, payment receipt) are not
// gated by this — only the scheduled sweeps are.
export function isAllowedSendTime(date: Date, policy: EmailSendPolicy): boolean {
  const { weekday, dateStr, hour } = israelParts(date);
  if (policy.blocked_weekdays.includes(weekday)) {
    const shabbatReopened =
      weekday === 6 && policy.saturday_ends_hour != null && hour >= policy.saturday_ends_hour;
    if (!shabbatReopened) return false;
  }
  if (policy.blocked_dates.includes(dateStr)) return false;
  if (hour < policy.allowed_hour_start || hour >= policy.allowed_hour_end) return false;
  return true;
}
