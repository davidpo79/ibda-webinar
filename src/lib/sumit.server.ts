import { getRequestUrl } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCurrentPrices } from "./pricing.server";
import { isFreeCoreLesson } from "./core-lessons";

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
  // True only when Sumit's response is confident enough to conclude this
  // transaction genuinely did NOT succeed (a real transaction record with a
  // recognized terminal failure status, or an explicit cancel/replay). When
  // both paid and definitivelyFailed are false, the outcome is still
  // unknown — callers must treat that as pending, not as a failure, and
  // must not notify the customer or change the order status from it.
  definitivelyFailed: boolean;
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

// /creditguy/gateway/gettransaction/ (and /creditguy/gateway/getreferencenumbers/)
// are the only endpoints in Sumit's official API that authenticate with a
// distinct "Public API Key" field (Credentials.APIPublicKey) rather than the
// regular APIKey used everywhere else, including the sibling
// /creditguy/gateway/transaction/ and /billing/payments/beginredirect/ calls —
// confirmed directly against Sumit's own Swagger docs. This value needs to be
// fetched from the Sumit dashboard and set as SUMIT_API_PUBLIC_KEY; it is not
// derivable from the existing private SUMIT_API_KEY. Until it's configured,
// this falls back to SUMIT_API_KEY under the correct field name — which may
// still be rejected by Sumit, but verifySumitTransaction already throws on
// that rejection rather than reporting a false "not paid", so callers fall
// back to the signed webhook/return payload instead.
function sumitGatewayVerifyCredentials() {
  const apiPublicKey = process.env.SUMIT_API_PUBLIC_KEY || process.env.SUMIT_API_KEY;
  const companyId = process.env.SUMIT_COMPANY_ID;
  if (!apiPublicKey || !companyId) {
    throw new Error("Sumit credentials are not configured");
  }
  return { CompanyID: Number(companyId), APIPublicKey: apiPublicKey };
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
  const requestedLessons = data.core_single_lesson_indexes ?? [];
  // Lesson 8 ("פינוי מושכר") is free — never a Sumit line item, regardless
  // of what the caller passed. This is the actual charging boundary, so it
  // enforces that independent of the client-side selection UI.
  const lessons = requestedLessons.filter((idx) => !isFreeCoreLesson(idx));
  // core_single_lesson_indexes being non-empty signals per-lesson pricing
  // was intended. If every requested lesson turned out free, core_single
  // has nothing left to charge for and must not fall back to a flat-rate
  // line for it below.
  const packageIds =
    requestedLessons.length > 0 && lessons.length === 0
      ? data.package_ids.filter((id) => id !== "core_single")
      : data.package_ids;

  const items =
    lessons.length > 0
      ? packageIds
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
      : packageIds.map((id) => {
          const price = prices[id];
          if (!price) throw new Error(`Unknown package: ${id}`);
          return {
            Item: { Name: PACKAGE_NAMES[id] || id },
            Quantity: 1,
            UnitPrice: applyDiscount(price, discount),
          };
        });

  if (items.length === 0) {
    throw new Error("createSumitPaymentPage: nothing chargeable in this request");
  }

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
// Per Sumit's official Swagger docs, this specific endpoint requires
// Credentials.APIPublicKey — a genuinely separate credential from the
// APIKey used by every other endpoint in this file (beginredirect, charge,
// recurring, etc.). See sumitGatewayVerifyCredentials() above.
export async function verifySumitTransaction(transactionId: string): Promise<SumitValidation> {
  const payload = { Credentials: sumitGatewayVerifyCredentials(), UniqueIdentifier: transactionId };
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

// Sumit's accounting-document webhook event (see extractSumitEventTransactionId
// in sumit-webhook-parse.ts) carries only its own EntityID, never our order
// reference — but createSumitPaymentPage always sets Customer.ExternalIdentifier
// to our order_reference at checkout time, and that comes back here. This is
// what lets a stuck order resolve even when the *first* payment IPN never
// arrives at all (not just when it fails to verify in time): the accounting
// event alone is enough to look the order back up directly from Sumit.
export async function getSumitDocumentDetails(
  documentId: string,
): Promise<{ externalIdentifier: string | null }> {
  const payload = { Credentials: sumitCredentials(), DocumentID: Number(documentId) };
  const res = await fetch(`${SUMIT_BASE_URL}/accounting/documents/getdetails/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sumit getdetails failed ${res.status}: ${text}`);
  const data = JSON.parse(text) as { Data?: Record<string, unknown> };
  const doc = data.Data ?? {};
  const inner = (doc.Document as Record<string, unknown>) || {};
  const customer =
    (inner.Customer as Record<string, unknown>) || (doc.Customer as Record<string, unknown>) || {};
  const externalIdentifier =
    String(
      inner.ExternalIdentifier || doc.ExternalIdentifier || customer.ExternalIdentifier || "",
    ) || null;
  return { externalIdentifier };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// gettransaction has a real settlement lag right after a redirect-flow
// checkout completes — confirmed empirically: a transaction it reports as
// "Transaction not found" at the moment the webhook fires reliably exists
// there a few seconds later. Callers that don't have a user waiting
// synchronously on the response (the webhook — the only path guaranteed to
// run regardless of whether the customer's browser stays open) should use
// this instead of a single verifySumitTransaction call, or a transient lag
// gets stranded as "unresolved" rather than turning into a correct "paid".
export async function verifySumitTransactionWithRetry(
  transactionId: string,
  attempts = 3,
  delayMs = 2500,
): Promise<SumitValidation> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await verifySumitTransaction(transactionId);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await delay(delayMs);
    }
  }
  throw lastErr;
}

export function parseSumitTransactionStatus(payload: Record<string, unknown>): SumitValidation {
  // Sumit's real webhook/redirect callback for a beginredirect-initiated
  // payment (our whole checkout flow) is a "short form" carrying none of
  // the Status/Success/Data fields below — just {valid: '1', documentid,
  // customerid} — confirmed against a real working reference
  // implementation of this exact flow. Treat that as authoritative on its
  // own; it's the common case, not an edge case.
  if (String(payload.valid ?? "") === "1") {
    return { paid: true, definitivelyFailed: false, status: "valid", raw: payload };
  }
  const statusStr = String(payload.Status ?? "");
  const success = payload.Success === true || statusStr.startsWith("Success");
  const txn = (payload.Data as Record<string, unknown>) || {};
  const txnStatus = String(txn.Status ?? "").toLowerCase();
  const amount = Number(txn.Amount ?? txn.TotalAmount ?? 0);
  const paid = success && ["paid", "approved", "success", "1"].includes(txnStatus) && amount > 0;
  // gettransaction has a real settlement lag right after a redirect-flow
  // checkout completes — calling it seconds too early doesn't return a
  // decline, it returns an empty/unrecognized result. Only conclude this
  // transaction genuinely failed when Sumit actually returned a real
  // transaction record (success) carrying a recognized terminal failure
  // status — never merely because the response didn't parse as "paid".
  // Treating "not (yet) paid" as "failed" was sending customers a false
  // "payment failed" email moments after a successful charge.
  const KNOWN_FAILURE_STATUSES = [
    "declined",
    "failed",
    "error",
    "cancelled",
    "canceled",
    "0",
    "-1",
  ];
  const definitivelyFailed =
    !paid && success && txnStatus !== "" && KNOWN_FAILURE_STATUSES.includes(txnStatus);
  return { paid, definitivelyFailed, status: txnStatus || statusStr, raw: payload };
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
