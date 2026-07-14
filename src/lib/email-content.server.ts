import { sql } from "./db.server";

// Package list + Hebrew labels for the admin email-editing screen — kept
// independent of email-templates.server.ts's internal constants so this
// file has no dependency on the templates themselves, only on the set of
// sellable package ids.
export const EDITABLE_PACKAGES: { id: string; label: string }[] = [
  { id: "open", label: "וובינר פתוח" },
  { id: "core_single", label: "וובינר בודד מסדרת הליבה" },
  { id: "core_full", label: "הסדרה המלאה" },
  { id: "premium_bundle", label: "חבילת פרימיום" },
  { id: "premium_partnership", label: "סדנת שיתוף במקרקעין" },
  { id: "premium_litigation", label: "סדנת ליטיגציה" },
  { id: "premium_registration", label: "סדנת רישום בית משותף" },
  { id: "premium_ai", label: "סדנת AI ואוטומציות" },
];

// Substitutes {placeholder} tokens in admin-editable template strings —
// used wherever the default wording embeds a computed value (discount
// percent, price, hours-remaining) so an override can still reference it.
export function applyPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export async function getEmailOverrides(): Promise<Record<string, string>> {
  const rows = await sql()<{ key: string; value: string }[]>`
    SELECT key, value FROM email_content_overrides
  `;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

// An empty value deletes the override — clearing a field in the admin UI
// reverts that piece of wording back to the hardcoded default.
export async function setEmailOverrides(changes: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(changes)) {
    const trimmed = value.trim();
    if (!trimmed) {
      await sql()`DELETE FROM email_content_overrides WHERE key = ${key}`;
    } else {
      await sql()`
        INSERT INTO email_content_overrides (key, value)
        VALUES (${key}, ${trimmed})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
    }
  }
}
