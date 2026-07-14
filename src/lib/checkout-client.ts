// Browser-only helpers for the registration/checkout forms (index, webinar,
// thank-you). Session-scoped so a Sumit redirect round-trip (leave the site,
// come back via cancel/back button) doesn't wipe out what the visitor
// already typed or selected, and so /thank-you can prefill contact details
// already collected on / or /webinar in the same browser session.

export type SavedContact = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  firm_name?: string;
  bar_license?: string;
  id_number?: string;
};

const CONTACT_KEY = "ibda:contact";
const SELECTION_PREFIX = "ibda:selection:";

export function saveContact(data: SavedContact): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadContact() || {};
    sessionStorage.setItem(CONTACT_KEY, JSON.stringify({ ...existing, ...data }));
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — skip persistence
  }
}

export function loadContact(): SavedContact | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CONTACT_KEY);
    return raw ? (JSON.parse(raw) as SavedContact) : null;
  } catch {
    return null;
  }
}

export function saveSelection(pageKey: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SELECTION_PREFIX + pageKey, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function loadSelection(pageKey: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SELECTION_PREFIX + pageKey);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

// Parses display strings like "₪ 1,620" into 1620. Used to sum a running
// total for the selected packages without duplicating the price numbers
// that already live in each page's pricing array.
export function parsePriceIls(price: string | undefined): number {
  if (!price) return 0;
  const digits = price.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}
