import { getRequestUrl } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCurrentPrices } from "./pricing.server";

const SUMIT_BASE_URL = process.env.SUMIT_BASE_URL || "https://api.sumit.co.il";

const PACKAGE_NAMES: Record<string, string> = {
  core_single: "וובינר בודד מסדרת הליבה",
  core_full: "הסדרה המלאה - 9 מפגשים",
  premium_litigation: "סדנת ליטיגציה בנדל״ן",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום - הכל כלול",
};

// Current live price (already reflects an admin-scheduled increase past its
// cutoff — see src/lib/pricing.server.ts). Async because it's DB-backed.
export async function getPackagePrice(packageId: string): Promise<number | undefined> {
  const prices = await getCurrentPrices();
  return prices[packageId];
}

type CreatePaymentInput = {
  package_ids: string[];
  email: string;
  full_name: string;
  phone: string;
  order_reference: string;
  id_number: string;
  discount_percent?: number;
  coupon_code?: string;
  core_single_lesson_indexes?: number[];
};

function applyDiscount(price: number, discountPercent: number): number {
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

type SumitValidation = {
  paid: boolean;
  status: string;
  raw: Record<string, unknown>;
};

function sumitCredentials() {
  const apiKey = process.env.SUMIT_API_KEY;
  const companyId = process.env.SUMIT_COMPANY_ID;
  if (!apiKey || !companyId) {
    throw new Error("Sumit credentials are not configured");
  }
  return { CompanyID: Number(companyId), APIKey: apiKey };
}

export function getSumitPublicOrigin() {
  const configured = process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const reqUrl = getRequestUrl();
  return `${reqUrl.protocol}//${reqUrl.host}`;
}

function baseParams(url: URL, data: CreatePaymentInput) {
  url.searchParams.set("orderRef", data.order_reference);
  url.searchParams.set("email", data.email);
  url.searchParams.set("package", data.package_ids.join(","));
  if (data.coupon_code) url.searchParams.set("coupon", data.coupon_code);
}

function returnUrl(origin: string, data: CreatePaymentInput) {
  const url = new URL("/api/public/sumit-return", origin);
  baseParams(url, data);
  return url.toString();
}

function cancelUrl(origin: string, data: CreatePaymentInput) {
  const url = new URL("/api/public/sumit-return", origin);
  baseParams(url, data);
  url.searchParams.set("cancelled", "1");
  return url.toString();
}

function webhookUrl(origin: string, data: CreatePaymentInput) {
  // Sumit calls this URL verbatim (query string included), so embedding our
  // own identifiers here — rather than relying on a database lookup — is
  // enough for the webhook to resolve who paid without extra storage.
  const url = new URL("/api/public/sumit-webhook", origin);
  baseParams(url, data);
  return url.toString();
}

// Creates a Sumit hosted payment page (redirect flow) and returns the URL
// the browser should be sent to. Mirrors /billing/payments/beginredirect/.
// Accepts one or more package_ids so a visitor buying several packages at
// once gets a single itemized invoice/charge instead of only ever being
// charged for one of them.
export async function createSumitPaymentPage(data: CreatePaymentInput) {
  const prices = await getCurrentPrices();
  const discount = data.discount_percent ?? 0;
  const lessons = data.core_single_lesson_indexes ?? [];

  const items =
    lessons.length > 0
      ? data.package_ids
          .filter((id) => id !== "core_single")
          .map((id) => {
            const price = prices[id];
            if (!price) throw new Error(`Unknown package: ${id}`);
            return {
              Item: { Name: PACKAGE_NAMES[id] || id },
              Quantity: 1,
              UnitPrice: applyDiscount(price, discount),
            };
          })
          .concat(
            lessons.map((idx) => {
              const price = prices.core_single;
              if (!price) throw new Error("Unknown package: core_single");
              return {
                Item: { Name: `${PACKAGE_NAMES.core_single} - מפגש ${idx}` },
                Quantity: 1,
                UnitPrice: applyDiscount(price, discount),
              };
            }),
          )
      : data.package_ids.map((id) => {
          const price = prices[id];
          if (!price) throw new Error(`Unknown package: ${id}`);
          return {
            Item: { Name: PACKAGE_NAMES[id] || id },
            Quantity: 1,
            UnitPrice: applyDiscount(price, discount),
          };
        });

  const origin = getSumitPublicOrigin();
  const payload = {
    Credentials: sumitCredentials(),
    Items: items,
    Currency: "ILS",
    ExternalIdentifier: data.order_reference,
    RedirectURL: returnUrl(origin, data),
    CancelRedirectURL: cancelUrl(origin, data),
    IPNURL: webhookUrl(origin, data),
    Customer: {
      Name: data.full_name,
      EmailAddress: data.email,
      Phone: data.phone.replace(/[^\d]/g, "") || undefined,
      // Israeli ID or business/dealer number — required for a valid חשבונית.
      // Accepted here (not only via Sumit's own hosted checkout UI) so it's
      // captured uniformly across card, Bit, Apple Pay, and Google Pay —
      // the wallet flows are native OS payment sheets with no room for an
      // extra field on Sumit's side.
      CompanyNumber: data.id_number.replace(/[^\d]/g, "") || undefined,
      ExternalIdentifier: data.order_reference,
      SearchMode: 0,
    },
    VATIncluded: true,
  };

  const res = await fetch(`${SUMIT_BASE_URL}/billing/payments/beginredirect/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[Sumit] beginredirect HTTP error", res.status, text);
    throw new Error(`Sumit error ${res.status}: ${text}`);
  }
  const json = JSON.parse(text) as {
    Status?: string | number;
    Data?: { RedirectURL?: string };
    RedirectURL?: string;
    UserErrorMessage?: string;
    TechnicalErrorDetails?: string;
  };
  const link = json.Data?.RedirectURL || json.RedirectURL;
  // beginredirect's healthy envelope is Status "0" (or empty) + a RedirectURL
  // + no UserErrorMessage — NOT "Success..." (that convention belongs to
  // other Sumit endpoints, e.g. gettransaction). Confirmed against a live
  // response: {Data: {RedirectURL: "..."}, Status: 0, UserErrorMessage: null}.
  if (!link || json.UserErrorMessage) {
    console.error("[Sumit] beginredirect rejected", { packages: data.package_ids, response: json });
    throw new Error(
      `Sumit failed: ${json.UserErrorMessage || json.TechnicalErrorDetails || String(json.Status ?? "") || text}`,
    );
  }

  return { payment_url: link };
}

// Verifies a completed transaction directly against Sumit — never trust the
// browser redirect or an unsigned webhook payload on its own.
//
// Credentials.APIKey (same field/value as every other endpoint here) is
// confirmed correct for this endpoint against a real working reference
// implementation of this exact call — a "PublicAPIKey"/"APIPublicKey" field
// is a red herring here; that's only for Sumit's separate card-vault
// tokenization endpoint, unrelated to transaction verification. If Sumit
// still rejects the request with "CompanyID/PublicAPIKey are missing"
// despite the correct field, the account's API key most likely lacks
// CreditGuy Gateway access — that needs enabling on Sumit's side (dashboard
// or support), not a code change.
export async function verifySumitTransaction(transactionId: string): Promise<SumitValidation> {
  const payload = { Credentials: sumitCredentials(), UniqueIdentifier: transactionId };
  const res = await fetch(`${SUMIT_BASE_URL}/creditguy/gateway/gettransaction/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sumit verify failed ${res.status}: ${text}`);
  const data = JSON.parse(text) as { Data?: unknown; UserErrorMessage?: string };
  console.log("[Sumit] gettransaction raw response", transactionId, text);
  // Sumit sometimes rejects the request itself (account/credentials problem
  // on this specific endpoint) rather than returning a real transaction
  // result. That's not the same as "this transaction failed" — throw so
  // callers fall back to a signed/already-trusted source instead of
  // concluding not-paid.
  if (data.UserErrorMessage && data.Data == null) {
    throw new Error(`Sumit verify rejected the request: ${data.UserErrorMessage}`);
  }
  return parseSumitTransactionStatus(data as Record<string, unknown>);
}

export function parseSumitTransactionStatus(payload: Record<string, unknown>): SumitValidation {
  // Sumit's real webhook/redirect callback for a beginredirect-initiated
  // payment (our whole checkout flow) is a "short form" carrying none of
  // the Status/Success/Data fields below — just {valid: '1', documentid,
  // customerid} — confirmed against a real working reference
  // implementation of this exact flow. Treat that as authoritative on its
  // own; it's the common case, not an edge case.
  if (String(payload.valid ?? "") === "1") {
    return { paid: true, status: "valid", raw: payload };
  }
  const statusStr = String(payload.Status ?? "");
  const success = payload.Success === true || statusStr.startsWith("Success");
  const txn = (payload.Data as Record<string, unknown>) || {};
  const txnStatus = String(txn.Status ?? "").toLowerCase();
  const amount = Number(txn.Amount ?? txn.TotalAmount ?? 0);
  const paid = success && ["paid", "approved", "success", "1"].includes(txnStatus) && amount > 0;
  return { paid, status: txnStatus || statusStr, raw: payload };
}

// Fail-closed HMAC-SHA256 signature check for the Sumit IPN webhook. When no
// SUMIT_WEBHOOK_KEY is configured, verification is skipped (local/dev only).
export function verifySumitWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const key = process.env.SUMIT_WEBHOOK_KEY;
  if (!key) return true;
  if (!signatureHeader) return false;
  const sig = signatureHeader
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

// ---------------------------------------------------------------------------
// Recurring billing — plumbing only. No product on the site currently sells
// a subscription; wire these into a UI + pricing entry before using them.
// ---------------------------------------------------------------------------

export async function chargeSumitRecurring(input: {
  customerToken: string;
  amountIls: number;
  description: string;
  uniqueId: string;
}) {
  const res = await fetch(`${SUMIT_BASE_URL}/billing/recurring/charge/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Credentials: sumitCredentials(),
      CustomerToken: input.customerToken,
      Amount: input.amountIls,
      Currency: "ILS",
      Description: input.description,
      UniqueID: input.uniqueId,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sumit recurring charge failed ${res.status}: ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

export async function listSumitRecurringForCustomer(customerToken: string) {
  const res = await fetch(`${SUMIT_BASE_URL}/billing/recurring/listforcustomer/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Credentials: sumitCredentials(), CustomerToken: customerToken }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sumit recurring list failed ${res.status}: ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

export async function cancelSumitRecurring(customerToken: string) {
  const res = await fetch(`${SUMIT_BASE_URL}/billing/recurring/cancel/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Credentials: sumitCredentials(), CustomerToken: customerToken }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sumit recurring cancel failed ${res.status}: ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}
