import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const {
    markSumitOrder,
    parseSumitTransactionStatus,
    resolveSumitOrder,
    verifySumitTransaction,
    verifySumitWebhookSignature,
  } = await import("@/lib/sumit.server");
  const { updateResendPaymentStatusByEmail } = await import("@/lib/resend.server");

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return new Response("ok (empty body)", { status: 200 });
  }

  const signature =
    request.headers.get("x-sumit-signature") ||
    request.headers.get("x-webhook-signature") ||
    request.headers.get("signature");

  if (!verifySumitWebhookSignature(rawBody, signature)) {
    console.warn("[sumit-webhook] HMAC mismatch — refusing");
    return new Response("invalid signature", { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      payload = JSON.parse(rawBody);
    } else {
      payload = Object.fromEntries(new URLSearchParams(rawBody).entries());
    }
  } catch (err) {
    console.error("[sumit-webhook] body parse error", err);
  }

  const url = new URL(request.url);
  url.searchParams.forEach((value, key) => {
    if (!(key in payload)) payload[key] = value;
  });

  const transactionId =
    String(payload.TransactionID || payload.ChargeID || payload.documentid || "") || null;
  const orderReference =
    String(payload.ExternalIdentifier || payload.orderRef || payload.order_reference || "") ||
    null;
  const storedOrder = await resolveSumitOrder({ orderReference });
  const email = String(payload.email || payload.EmailAddress || storedOrder?.email || "") || null;

  console.log("[sumit-webhook] received", { transactionId, orderReference, hasEmail: Boolean(email) });

  if (!transactionId && !orderReference) {
    // 200 so Sumit doesn't keep retrying a call we can't process.
    return new Response("ok (no identifiers)", { status: 200 });
  }

  let validation = parseSumitTransactionStatus(payload);
  try {
    if (transactionId) validation = await verifySumitTransaction(transactionId);
  } catch (err) {
    console.error("[sumit-webhook] verify error — fail closed", err);
    validation = { paid: false, status: "verify_failed", raw: payload };
  }

  await markSumitOrder({
    orderReference,
    transactionId,
    status: validation.paid ? "paid" : "failed",
    raw: validation.raw,
  });

  if (email) {
    try {
      await updateResendPaymentStatusByEmail(email, validation.paid ? "שולם" : "נכשל");
    } catch (err) {
      console.error("[sumit-webhook] Resend update error", err);
    }
    try {
      const { updateSheetPaymentStatusByEmail } = await import("@/lib/google-sheets.server");
      await updateSheetPaymentStatusByEmail(email, validation.paid ? "שולם" : "נכשל");
    } catch (err) {
      console.error("[sumit-webhook] sheets status update error", err);
    }
  }

  return new Response("ok", { status: 200 });
}

export const Route = createFileRoute("/api/public/sumit-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
