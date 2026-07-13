import { getRequestUrl } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const SUMIT_BASE_URL = process.env.SUMIT_BASE_URL || "https://api.sumit.co.il";

const PACKAGE_PRICES: Record<string, number> = {
  core_single: 180,
  core_full: 1620,
  premium_litigation: 360,
  premium_registration: 1080,
  premium_partnership: 540,
  premium_ai: 360,
  premium_bundle: 2700,
};

const PACKAGE_NAMES: Record<string, string> = {
  core_single: "וובינר בודד מסדרת הליבה",
  core_full: "הסדרה המלאה - 9 מפגשים",
  premium_litigation: "סדנת ליטיגציה בנדל״ן",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום - הכל כלול",
};

type CreatePaymentInput = {
  package_id: string;
  email: string;
  full_name: string;
  phone: string;
  order_reference: string;
};

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
  const configured =
    process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const reqUrl = getRequestUrl();
  return `${reqUrl.protocol}//${reqUrl.host}`;
}

function returnUrl(origin: string, data: CreatePaymentInput) {
  const url = new URL("/api/public/sumit-return", origin);
  url.searchParams.set("orderRef", data.order_reference);
  url.searchParams.set("email", data.email);
  url.searchParams.set("package", data.package_id);
  return url.toString();
}

function cancelUrl(origin: string, data: CreatePaymentInput) {
  const url = new URL("/api/public/sumit-return", origin);
  url.searchParams.set("orderRef", data.order_reference);
  url.searchParams.set("email", data.email);
  url.searchParams.set("package", data.package_id);
  url.searchParams.set("cancelled", "1");
  return url.toString();
}

function webhookUrl(origin: string) {
  return new URL("/api/public/sumit-webhook", origin).toString();
}

// Creates a Sumit hosted payment page (redirect flow) and returns the URL
// the browser should be sent to. Mirrors /billing/payments/beginredirect/.
export async function createSumitPaymentPage(data: CreatePaymentInput) {
  const price = PACKAGE_PRICES[data.package_id];
  if (!price) {
    throw new Error(`Unknown package: ${data.package_id}`);
  }

  const origin = getSumitPublicOrigin();
  const payload = {
    Credentials: sumitCredentials(),
    Items: [
      {
        Item: { Name: PACKAGE_NAMES[data.package_id] || data.package_id },
        Quantity: 1,
        UnitPrice: price,
      },
    ],
    Currency: "ILS",
    ExternalIdentifier: data.order_reference,
    RedirectURL: returnUrl(origin, data),
    CancelRedirectURL: cancelUrl(origin, data),
    IPNURL: webhookUrl(origin),
    Customer: {
      Name: data.full_name,
      EmailAddress: data.email,
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
    throw new Error(`Sumit error ${res.status}: ${text}`);
  }
  const json = JSON.parse(text) as {
    Status?: string;
    Data?: { RedirectURL?: string };
    RedirectURL?: string;
    UserErrorMessage?: string;
    TechnicalErrorDetails?: string;
  };
  const link = json.Data?.RedirectURL || json.RedirectURL;
  const statusStr = String(json.Status || "");
  if (!link || !statusStr.startsWith("Success")) {
    throw new Error(
      `Sumit failed: ${json.UserErrorMessage || json.TechnicalErrorDetails || statusStr || text}`,
    );
  }

  await rememberSumitOrder({
    orderReference: data.order_reference,
    email: data.email,
    packageId: data.package_id,
    status: "created",
  });

  return { payment_url: link };
}

// Verifies a completed transaction directly against Sumit — never trust the
// browser redirect or an unsigned webhook payload on its own.
export async function verifySumitTransaction(transactionId: string): Promise<SumitValidation> {
  const payload = { Credentials: sumitCredentials(), UniqueIdentifier: transactionId };
  const res = await fetch(`${SUMIT_BASE_URL}/creditguy/gateway/gettransaction/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sumit verify failed ${res.status}: ${text}`);
  const data = JSON.parse(text) as Record<string, unknown>;
  return parseSumitTransactionStatus(data);
}

export function parseSumitTransactionStatus(payload: Record<string, unknown>): SumitValidation {
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
export function verifySumitWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const key = process.env.SUMIT_WEBHOOK_KEY;
  if (!key) return true;
  if (!signatureHeader) return false;
  const sig = signatureHeader.trim().replace(/^sha256=/i, "").toLowerCase();
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

// ---------------------------------------------------------------------------
// Order bookkeeping (Supabase) — same pattern the Takbull integration used.
// ---------------------------------------------------------------------------

export async function rememberSumitOrder(order: {
  orderReference: string;
  email: string;
  packageId: string;
  status: string;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await db.from("sumit_payment_orders").upsert(
      {
        order_reference: order.orderReference,
        email: order.email.toLowerCase(),
        package_id: order.packageId,
        status: order.status,
      },
      { onConflict: "order_reference" },
    );
  } catch (err) {
    console.error("[sumit] could not remember order", err);
  }
}

export async function resolveSumitOrder(input: { orderReference?: string | null }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!input.orderReference) return null;
    const { data, error } = await db
      .from("sumit_payment_orders")
      .select("*")
      .eq("order_reference", input.orderReference)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as null | { email?: string; package_id?: string; order_reference?: string };
  } catch (err) {
    console.error("[sumit] could not resolve order", err);
    return null;
  }
}

export async function markSumitOrder(input: {
  orderReference?: string | null;
  transactionId?: string | null;
  status: string;
  raw?: Record<string, unknown>;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!input.orderReference) return;
    await db
      .from("sumit_payment_orders")
      .update({
        status: input.status,
        transaction_id: input.transactionId || null,
        raw_payload: input.raw || null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_reference", input.orderReference);
  } catch (err) {
    console.error("[sumit] could not mark order", err);
  }
}
