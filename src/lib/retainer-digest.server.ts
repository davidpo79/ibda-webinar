import { sql } from "./db.server";
import { sendRawEmail } from "./resend.server";
import { escapeHtml } from "./escape-html";
import { getRetainerSummary, listEntries } from "./retainer.server";
import type { RetainerSummary, RetainerEntryRow } from "./retainer.server";
import { getPartnerEmail } from "./partner-auth.server";

// Twice-weekly status email to the client: where the bank of hours stands,
// what was done since the last one, and what is still owed. Sundays and
// Thursdays, so a week is split into a "here's what's starting" and a
// "here's what got done" checkpoint.

const SEND_DAYS = [0, 4]; // Sunday, Thursday (Israel week)
const SEND_AFTER_HOUR = 9; // local hour, Israel time
const TZ = "Asia/Jerusalem";

function israelParts(d: Date): { date: string; weekday: number; hour: number } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d),
  );
  // en-US short weekday is stable regardless of locale data for Hebrew.
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { date, weekday, hour };
}

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const money = (n: number) => ILS.format(Math.round(n));
const HOURS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const hours = (n: number) => HOURS.format(n);

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

// A plain, self-contained shell. Deliberately not the marketing template
// used for customer mail: this is an internal business report, so it
// carries no hero image and no unsubscribe footer (unsubscribing from your
// own project's status report would just silently break the reporting).
function digestShell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body dir="rtl" style="margin:0;padding:0;background-color:#F5F3EE;font-family:'Lucida Grande','Lucida Sans Unicode',Arial,sans-serif;">
  <table role="presentation" dir="rtl" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#F5F3EE;">
    <tr><td dir="rtl" align="center" style="padding:28px 14px;">
      <table role="presentation" dir="rtl" width="100%" style="max-width:580px;background-color:#FFFFFF;border-radius:10px;border:1px solid #E4DFD3;">
        <tr><td dir="rtl" style="padding:24px 26px;">
          ${bodyHtml}
        </td></tr>
      </table>
      <div dir="rtl" style="color:#9A9384;font-size:11px;margin-top:14px;">
        עדכון אוטומטי · נשלח בימי ראשון וחמישי
      </div>
    </td></tr>
  </table>
</body></html>`;
}

function bar(percent: number): string {
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 5);
  return `<table role="presentation" dir="ltr" cellPadding="0" cellSpacing="0" width="100%" style="border-collapse:collapse;">
    <tr>
      <td style="height:12px;background-color:#C4A461;width:${Math.max(percent, 1)}%;border-radius:6px 0 0 6px;">&nbsp;</td>
      <td style="height:12px;background-color:#E8E2D4;border-radius:0 6px 6px 0;">&nbsp;</td>
    </tr>
  </table><!-- ${filled} -->`;
}

function statRow(label: string, value: string, note?: string): string {
  return `<tr>
    <td dir="rtl" style="padding:9px 0;border-bottom:1px solid #F0ECE2;color:#6B6455;font-size:13px;">${escapeHtml(label)}</td>
    <td dir="rtl" align="left" style="padding:9px 0;border-bottom:1px solid #F0ECE2;color:#221E16;font-size:15px;font-weight:bold;white-space:nowrap;">
      ${escapeHtml(value)}${note ? `<span style="color:#9A9384;font-size:11px;font-weight:normal;"> ${escapeHtml(note)}</span>` : ""}
    </td>
  </tr>`;
}

export type DigestContent = { subject: string; html: string };

export function buildDigestEmail(
  summary: RetainerSummary,
  recentEntries: RetainerEntryRow[],
  sinceLabel: string | null,
): DigestContent {
  const pct = Math.round(summary.percentUsed);

  // Forward look at the average pace since the bank opened. Suppressed in
  // the first week, when dividing by a handful of days produces a wild
  // number that would read as a real projection.
  const daysElapsed = summary.startedOn
    ? Math.round((Date.now() - new Date(`${summary.startedOn}T00:00:00Z`).getTime()) / 86400000)
    : 0;
  const perWeek = daysElapsed >= 7 ? (summary.hoursUsed / daysElapsed) * 7 : null;
  const weeksLeft = perWeek && perWeek > 0 ? summary.hoursRemaining / perWeek : null;

  const workHtml = recentEntries.length
    ? recentEntries
        .map(
          (e) => `<tr><td dir="rtl" style="padding:7px 0;border-bottom:1px solid #F5F2EA;">
            <div style="color:#221E16;font-size:14px;font-weight:bold;">${escapeHtml(e.title)}</div>
            ${e.details ? `<div style="color:#6B6455;font-size:12px;line-height:1.6;margin-top:2px;">${escapeHtml(e.details)}</div>` : ""}
            <div style="color:#9A9384;font-size:11px;margin-top:3px;">${escapeHtml(shortDate(e.worked_on))} · ${escapeHtml(hours(Number(e.hours)))} שעות</div>
          </td></tr>`,
        )
        .join("")
    : `<tr><td dir="rtl" style="padding:10px 0;color:#9A9384;font-size:13px;">לא נרשמו שעות בתקופה זו.</td></tr>`;

  const body = `
    <div dir="rtl" style="color:#221E16;font-size:19px;font-weight:bold;">עדכון מצב · בנק שעות</div>
    <div dir="rtl" style="color:#9A9384;font-size:12px;margin-top:3px;">
      ${escapeHtml(sinceLabel ? `העדכון מכסה את התקופה מאז ${sinceLabel}` : "עדכון ראשון")}
    </div>

    <div dir="rtl" style="margin-top:20px;color:#6B6455;font-size:13px;">
      נוצלו <b style="color:#221E16;font-size:16px;">${escapeHtml(hours(summary.hoursUsed))}</b>
      מתוך ${escapeHtml(hours(summary.totalHours))} שעות (${pct}%)
    </div>
    <div style="margin-top:8px;">${bar(summary.percentUsed)}</div>
    <div dir="rtl" style="margin-top:8px;color:#6B6455;font-size:13px;">
      נותרו <b style="color:#221E16;font-size:16px;">${escapeHtml(hours(summary.hoursRemaining))}</b> שעות בבנק
    </div>

    <table role="presentation" dir="rtl" width="100%" style="margin-top:20px;border-collapse:collapse;">
      ${statRow("שווי השעות שנוצלו", money(summary.valueUsed), `לפי ${money(summary.hourlyRate)} לשעה`)}
      ${statRow("שולם בפועל", money(summary.paidTotal), `מתוך ${money(summary.totalAmount)}`)}
      ${statRow("נותר לתשלום", money(summary.paidRemaining))}
      ${
        weeksLeft && Number.isFinite(weeksLeft)
          ? statRow("בקצב הנוכחי", `כ-${Math.round(weeksLeft)} שבועות`, "עד סיום הבנק")
          : ""
      }
    </table>

    <div dir="rtl" style="margin-top:24px;color:#221E16;font-size:15px;font-weight:bold;">מה בוצע</div>
    <table role="presentation" dir="rtl" width="100%" style="margin-top:6px;border-collapse:collapse;">
      ${workHtml}
    </table>

    ${
      summary.overageHours > 0
        ? `<div dir="rtl" style="margin-top:18px;padding:11px 13px;background-color:#FDF2E9;border-right:3px solid #C97B3C;color:#8A4B12;font-size:13px;">
             חריגה של ${escapeHtml(hours(summary.overageHours))} שעות מעבר לבנק.
           </div>`
        : ""
    }

    <div dir="rtl" style="margin-top:22px;padding-top:16px;border-top:1px solid #F0ECE2;color:#9A9384;font-size:11.5px;line-height:1.7;">
      השעות נמדדות אוטומטית מתוך סשני העבודה, בניכוי זמני המתנה. כלומר זמן
      העבודה נטו בפועל בלבד: ניהול הפרויקט, ארכיטקטורה, תשתיות, פיתוח,
      עריכה ובדיקות.
    </div>`;

  return {
    subject: `בנק שעות · נותרו ${hours(summary.hoursRemaining)} שעות ו-${money(summary.paidRemaining)} לתשלום`,
    html: digestShell(body),
  };
}

async function lastDigest(): Promise<{ sent_at: string } | null> {
  const rows = await sql()<{ sent_at: string }[]>`
    SELECT sent_at FROM retainer_digest_log ORDER BY sent_at DESC LIMIT 1
  `;
  return rows[0] ?? null;
}

// Entries recorded since the previous digest — "what got done this week",
// keyed on when the row was written rather than the date worked, so a
// backdated manual entry still shows up in the next report rather than
// silently missing its window.
async function entriesSince(since: string | null): Promise<RetainerEntryRow[]> {
  if (!since) return (await listEntries()).slice(0, 12);
  return sql()<RetainerEntryRow[]>`
    SELECT * FROM retainer_entries
    WHERE created_at > ${since} OR updated_at > ${since}
    ORDER BY worked_on DESC, created_at DESC
    LIMIT 20
  `;
}

export async function sendRetainerDigest(
  forDate: string,
): Promise<{ sent: boolean; reason?: string }> {
  const recipient = (await getPartnerEmail("yifat")) ?? "ifat@ibda-law.com";
  const summary = await getRetainerSummary();
  const prev = await lastDigest();
  const recent = await entriesSince(prev?.sent_at ?? null);

  const sinceLabel = prev?.sent_at ? shortDate(prev.sent_at) : null;
  const { subject, html } = buildDigestEmail(summary, recent, sinceLabel);

  // Claim the slot before sending. The unique constraint on sent_for_date
  // is what makes a double tick (or two instances) impossible to turn into
  // two emails; if the insert loses the race, nobody sends.
  const claimed = await sql()<{ id: string }[]>`
    INSERT INTO retainer_digest_log (sent_for_date, recipient, hours_used, hours_remaining)
    VALUES (${forDate}, ${recipient}, ${summary.hoursUsed}, ${summary.hoursRemaining})
    ON CONFLICT (sent_for_date) DO NOTHING
    RETURNING id
  `;
  if (claimed.length === 0) return { sent: false, reason: "already sent for this date" };

  try {
    await sendRawEmail(recipient, subject, html);
  } catch (err) {
    // Release the claim so the next tick can retry rather than the day
    // being permanently marked as sent when nothing arrived.
    await sql()`DELETE FROM retainer_digest_log WHERE sent_for_date = ${forDate}`;
    throw err;
  }
  console.log(`[retainer-digest] sent to ${recipient} for ${forDate}`);
  return { sent: true };
}

// Called from the shared automation tick (every 10 minutes). Sends at most
// one digest per calendar day, only on the configured days, and only once
// the local hour has been reached.
export async function runRetainerDigestSweep(): Promise<{ sent: boolean; reason?: string }> {
  const { date, weekday, hour } = israelParts(new Date());
  if (!SEND_DAYS.includes(weekday)) return { sent: false, reason: "not a send day" };
  if (hour < SEND_AFTER_HOUR) return { sent: false, reason: "too early" };
  return sendRetainerDigest(date);
}

// Fires the digest regardless of the day/hour gate, and without the
// once-per-date claim — used by the editor's "send now" button, where a
// second copy on the same day is the intent rather than a bug.
export async function sendRetainerDigestNow(): Promise<void> {
  const recipient = (await getPartnerEmail("yifat")) ?? "ifat@ibda-law.com";
  const summary = await getRetainerSummary();
  const prev = await lastDigest();
  const recent = await entriesSince(prev?.sent_at ?? null);
  const { subject, html } = buildDigestEmail(
    summary,
    recent,
    prev?.sent_at ? shortDate(prev.sent_at) : null,
  );
  await sendRawEmail(recipient, subject, html);
  console.log(`[retainer-digest] manual send to ${recipient}`);
}

export async function sendPasswordResetEmail(
  email: string,
  displayName: string,
  token: string,
): Promise<void> {
  const origin = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const link = `${origin}/partner/reset?token=${encodeURIComponent(token)}`;
  const body = `
    <div dir="rtl" style="color:#221E16;font-size:18px;font-weight:bold;">איפוס סיסמה</div>
    <div dir="rtl" style="margin-top:14px;color:#6B6455;font-size:14px;line-height:1.8;">
      שלום ${escapeHtml(displayName)},<br />
      התקבלה בקשה לאיפוס הסיסמה שלך. הקישור תקף ל-30 דקות ולשימוש חד פעמי.
    </div>
    <div dir="rtl" style="margin-top:22px;">
      <a href="${link}" dir="ltr" style="display:inline-block;background-color:#C4A461;color:#17150F;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:6px;unicode-bidi:isolate;">
        קביעת סיסמה חדשה
      </a>
    </div>
    <div dir="rtl" style="margin-top:22px;color:#9A9384;font-size:12px;line-height:1.7;">
      אם לא ביקשת לאפס סיסמה, אפשר להתעלם מהמייל הזה. הסיסמה הקיימת תישאר בתוקף.
    </div>`;
  await sendRawEmail(email, "איפוס סיסמה · בנק שעות", digestShell(body));
}
