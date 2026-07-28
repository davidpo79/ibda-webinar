import { formatSessionDate } from "@/lib/format-date";

// "המפגש הקרוב: יום חמישי, 30.7 · 10:00 - הסכם השכירות. {desc}" — the
// shared line format used both as the visible sub-headline and as the
// og:description/meta description, so a shared link (or the page itself)
// leads with the concrete next occurrence instead of a generic blurb.
export function formatUpcomingLine(iso: string, title: string, desc: string): string {
  const weekday = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
  const dateLabel = formatSessionDate(iso);
  return `המפגש הקרוב: ${weekday}, ${dateLabel} - ${title}. ${desc}`;
}

// Falls back to the plain description when there's no confirmed date yet
// (session TBD) — used by the single-package landing pages.
export function buildSessionOgDescription(
  session: { starts_at: string; date_tbd?: boolean } | null | undefined,
  title: string,
  desc: string,
): string {
  if (!session || session.date_tbd) return desc;
  return formatUpcomingLine(session.starts_at, title, desc);
}
