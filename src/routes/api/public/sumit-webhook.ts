import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { parseSumitTransactionStatus, verifySumitTransaction, verifySumitWebhookSignature } =
    await import("@/lib/sumit.server");
  const { updateResendPaymentStatusByEmail } = await import("@/lib/resend.server");
  const { markOrderStatus } = await import("@/lib/orders.server");

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
    String(payload.ExternalIdentifier || payload.orderRef || payload.order_reference || "") || null;
  // email/package travel as query params on the IPNURL we generated
  // ourselves, so no database lookup is needed to resolve who this is.
  const email = String(payload.email || payload.EmailAddress || "") || null;
  // Comma-joined when the purchase covered several packages at once.
  const packageIds = String(payload.package || "")
    .split(",")
    .filter(Boolean);

  console.log("[sumit-webhook] received", {
    transactionId,
    orderReference,
    hasEmail: Boolean(email),
  });

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

  if (email) {
    try {
      await updateResendPaymentStatusByEmail(email, validation.paid ? "שולם" : "נכשל", packageIds);
    } catch (err) {
      console.error("[sumit-webhook] Resend update error", err);
    }
  }

  if (orderReference) {
    try {
      await markOrderStatus({
        orderReference,
        transactionId,
        status: validation.paid ? "paid" : "failed",
      });
    } catch (err) {
      console.error("[sumit-webhook] order status update error", err);
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
