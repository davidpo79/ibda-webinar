import { formatSessionDate } from "./format-date";

type MinimalSession = { key: string | null; starts_at: string; date_tbd?: boolean };

// A date_tbd session's starts_at is a meaningless placeholder (never shown
// on its own), so it must never win an "earliest" comparison — otherwise a
// lesson with no confirmed date yet could make core_full's "starting from"
// label show a date nothing is actually happening on.
function earliestStartsAt(sessions: MinimalSession[]): string | null {
  const dated = sessions.filter((s) => !s.date_tbd);
  if (dated.length === 0) return null;
  return dated.reduce((a, b) => (new Date(a.starts_at) < new Date(b.starts_at) ? a : b)).starts_at;
}

// Resolves a display-ready date label for each priced package id, given the
// current core-lesson and premium-workshop sessions — used everywhere a
// product/price is shown (pricing cards, registration checklists) so buyers
// see when a paid item actually happens without leaving that section.
export function buildPricingDateLabels(
  coreSessions: MinimalSession[],
  premiumSessions: MinimalSession[],
): Record<string, string> {
  const labels: Record<string, string> = {};

  const coreEarliest = earliestStartsAt(coreSessions);
  if (coreEarliest) labels.core_full = `החל מ-${formatSessionDate(coreEarliest)}`;

  const bundleEarliest = earliestStartsAt([...coreSessions, ...premiumSessions]);
  if (bundleEarliest) labels.premium_bundle = `החל מ-${formatSessionDate(bundleEarliest)}`;

  for (const s of premiumSessions) {
    if (s.date_tbd) continue;
    const label = formatSessionDate(s.starts_at);
    if (s.key && label) labels[s.key] = label;
  }

  return labels;
}
