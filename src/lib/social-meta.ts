import { formatSessionDate } from "@/lib/format-date";

// Builds a link-preview description that leads with the concrete next
// occurrence ("יום חמישי, 30.7 · 10:00 - הסכם השכירות") instead of the
// generic site tagline, so a shared landing-page link creates urgency
// instead of reading like a catalog blurb. Falls back to the plain
// description when there's no confirmed date yet (session TBD).
export function buildSessionOgDescription(
  session: { starts_at: string; date_tbd?: boolean } | null | undefined,
  title: string,
  desc: string,
): string {
  if (!session || session.date_tbd) return desc;
  const weekday = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(session.starts_at));
  const dateLabel = formatSessionDate(session.starts_at);
  return `המפגש הקרוב: ${weekday}, ${dateLabel} - ${title}. ${desc}`;
}
