// Formats an ISO timestamp as "D.M · HH:MM" in Israel time — matches the
// site's existing hardcoded date-label format (e.g. "26.7 · 10:00").
export function formatSessionDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")} · ${get("hour")}:${get("minute")}`;
}

const ISRAEL_TZ = "Asia/Jerusalem";

// Just the "HH:MM" portion, in Israel time — used in reminder-email subject
// lines ("תזכורת - מחר בשעה 10:00 מתחילים!").
export function formatIsraelTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

function partsOf(d: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ISRAEL_TZ, hour12: false, ...opts })
    .formatToParts(d)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {} as Record<string, string>);
}

// Renders an ISO instant as the "YYYY-MM-DDTHH:mm" value a
// <input type="datetime-local"> expects, in Israel civil time — so the
// admin schedule editor shows/edits the same wall-clock time visitors see.
export function isoToIsraelDatetimeLocal(iso: string): string {
  const parts = partsOf(new Date(iso), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Inverse of the above: interprets a "YYYY-MM-DDTHH:mm" value as Israel
// civil time and returns the equivalent UTC ISO instant. Resolves the
// correct IST/IDT offset for that specific date (Israel observes DST) via a
// single-pass guess-and-correct against Asia/Jerusalem's own rendering.
export function israelDatetimeLocalToISOString(local: string): string {
  const guessUTC = new Date(`${local}:00Z`);
  const parts = partsOf(guessUTC, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const wallFromGuess = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = wallFromGuess - guessUTC.getTime();
  return new Date(guessUTC.getTime() - offsetMs).toISOString();
}

const WEEKDAY_HE: Record<string, string> = {
  Sun: "ראשון",
  Mon: "שני",
  Tue: "שלישי",
  Wed: "רביעי",
  Thu: "חמישי",
  Fri: "שישי",
  Sat: "שבת",
};

// Renders "יום ראשון 26.7 בשעה 10:00" — the phrasing used throughout the
// email-automation spec's welcome/reminder copy.
export function formatHebrewFull(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = partsOf(d, {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = WEEKDAY_HE[parts.weekday] || "";
  return `יום ${day} ${parts.day}.${parts.month} בשעה ${parts.hour}:${parts.minute}`;
}

// Packages whose reminder fires the evening before (21:00 Israel time)
// rather than the morning before (09:00) — matches the original
// ActiveCampaign automations' per-package wait-until pattern.
const EVENING_BEFORE_PACKAGES = new Set(["core_single", "core_full", "premium_litigation"]);

// Computes when a package's "day before" reminder should fire, given the
// anchor session's start time — always the Israel-calendar day before the
// session, at 09:00 or 21:00 Israel time depending on the package. Computed
// dynamically from the session's current starts_at (not a hardcoded date),
// so admin edits to the schedule automatically shift the reminder too.
export function reminderDueAt(sessionStartsAtIso: string, packageId: string): Date {
  const sessionDate = new Date(sessionStartsAtIso);
  const hour = EVENING_BEFORE_PACKAGES.has(packageId) ? 21 : 9;
  const parts = partsOf(sessionDate, { year: "numeric", month: "2-digit", day: "2-digit" });
  const dayBefore = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const yy = dayBefore.getUTCFullYear();
  const mm = String(dayBefore.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dayBefore.getUTCDate()).padStart(2, "0");
  const localStr = `${yy}-${mm}-${dd}T${String(hour).padStart(2, "0")}:00`;
  return new Date(israelDatetimeLocalToISOString(localStr));
}
