// Google Sheets sync for registration backup — now the practical system of
// record for full registration detail (firm, bar license, packages, payment
// status), since ActiveCampaign's custom fields are gone. Appends one row
// per registration and updates payment status after Sumit's webhook fires.
// Failures MUST NOT block the registration or payment flow — every call site
// wraps this in try/catch.

import { JWT } from "google-auth-library";

const SHEETS_API_URL = "https://sheets.googleapis.com/v4";
const SHEET_TAB = "נרשמים";
// Column layout (keep in sync with the sheet header row A1:I1):
// A תאריך ושעת הוספה | B שם פרטי | C שם משפחה | D אימייל | E טלפון נייד
// F שם המשרד או החברה | G מספר רישיון עורכי דין | H בחירת מסלולים וחבילות
// I סטטוס תשלום
const STATUS_COLUMN = "I";
const EMAIL_COLUMN_INDEX = 3; // zero-based within a returned row (D = index 3)
const STATUS_COLUMN_INDEX = 8; // I = index 8

const PACKAGE_LABELS: Record<string, string> = {
  open: "וובינר פתוח",
  core_full: "הסדרה המלאה 9 מפגשים",
  core_single: "וובינר בודד מסדרת הליבה",
  premium_litigation: "סדנת ליטיגציה בנדל\"ן",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום הכל כלול",
};

// Free packages don't go through Takbull, so they get a terminal status
// at registration time. Everything else starts as "ממתין לתשלום".
const FREE_PACKAGES = new Set(["open"]);

export type SheetRegistrationRow = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  firm_name?: string;
  bar_license?: string;
  selected_packages: string[];
  core_single_lesson?: string;
  core_single_lesson_index?: number;
};

function formatIsraelDateTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatPackages(data: SheetRegistrationRow): string {
  return data.selected_packages
    .map((p) => {
      if (p === "core_single" && data.core_single_lesson) {
        return `${PACKAGE_LABELS[p] ?? p} (${data.core_single_lesson_index ?? "?"}. ${data.core_single_lesson})`;
      }
      return PACKAGE_LABELS[p] ?? p;
    })
    .join(", ");
}

function resolveInitialStatus(selected: string[]): string {
  const hasPaid = selected.some((p) => !FREE_PACKAGES.has(p));
  return hasPaid ? "ממתין לתשלום" : "הרשמה חינם";
}

let _jwtClient: JWT | undefined;

function getSheetId(): string | null {
  const sheetId = process.env.GOOGLE_SHEETS_REGISTRATIONS_ID;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!sheetId || !clientEmail || !privateKey) {
    console.warn("[google-sheets] missing service-account credentials or sheet id — skipping");
    return null;
  }
  return sheetId;
}

async function getAccessToken(): Promise<string | null> {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  // Railway env vars store literal "\n" for multiline secrets — restore real newlines.
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;

  if (!_jwtClient) {
    _jwtClient = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  const { token } = await _jwtClient.getAccessToken();
  return token ?? null;
}

export async function appendRegistrationToSheet(data: SheetRegistrationRow): Promise<void> {
  const sheetId = getSheetId();
  if (!sheetId) return;
  const token = await getAccessToken();
  if (!token) return;

  // Prefix phone and license with an apostrophe so Google Sheets treats them as
  // plain text and preserves leading zeros (e.g. 054... or 01234...).
  const asText = (value: string) => (value ? `'${value}` : "");

  const row = [
    formatIsraelDateTime(new Date()),
    data.first_name,
    data.last_name,
    data.email,
    asText(data.phone),
    data.firm_name ?? "",
    asText(data.bar_license ?? ""),
    formatPackages(data),
    resolveInitialStatus(data.selected_packages),
  ];

  const range = `${SHEET_TAB}!A:I`;
  const url = `${SHEETS_API_URL}/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[google-sheets] append failed [${response.status}]: ${body}`);
    throw new Error(`Sheets append failed: ${response.status}`);
  }
}

// After a Sumit payment update, patch the most recent row for this email
// that isn't already in a terminal state. Runs only for paid flows.
export async function updateSheetPaymentStatusByEmail(
  email: string,
  status: "שולם" | "נכשל",
): Promise<void> {
  const sheetId = getSheetId();
  if (!sheetId || !email) return;
  const token = await getAccessToken();
  if (!token) return;

  const readRange = `${SHEET_TAB}!A2:I`;
  const readUrl = `${SHEETS_API_URL}/spreadsheets/${sheetId}/values/${encodeURIComponent(readRange)}`;
  const readRes = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!readRes.ok) {
    const body = await readRes.text();
    console.error(`[google-sheets] read failed [${readRes.status}]: ${body}`);
    throw new Error(`Sheets read failed: ${readRes.status}`);
  }
  const data = (await readRes.json()) as { values?: string[][] };
  const rows = data.values ?? [];
  const target = email.trim().toLowerCase();

  // Search from bottom up for the newest matching row that is still pending.
  let matchedRowNumber: number | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const rowEmail = (row[EMAIL_COLUMN_INDEX] || "").trim().toLowerCase();
    if (rowEmail !== target) continue;
    const rowStatus = (row[STATUS_COLUMN_INDEX] || "").trim();
    if (rowStatus === "שולם" || rowStatus === "נכשל") continue;
    matchedRowNumber = i + 2; // +2 because rows start at A2 and are 1-indexed
    break;
  }

  if (!matchedRowNumber) {
    console.warn(`[google-sheets] no pending row found for email=${email}`);
    return;
  }

  const writeRange = `${SHEET_TAB}!${STATUS_COLUMN}${matchedRowNumber}`;
  const writeUrl = `${SHEETS_API_URL}/spreadsheets/${sheetId}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`;
  const writeRes = await fetch(writeUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [[status]] }),
  });
  if (!writeRes.ok) {
    const body = await writeRes.text();
    console.error(`[google-sheets] status update failed [${writeRes.status}]: ${body}`);
    throw new Error(`Sheets status update failed: ${writeRes.status}`);
  }
}
