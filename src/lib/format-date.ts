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
