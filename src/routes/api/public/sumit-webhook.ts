import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { verifySumitTransaction, verifySumitWebhookSignature } =
    await import("@/lib/sumit.server");
  const { updateResendPaymentStatusByEmail } = await import("@/lib/resend.server");
  const { markOrderStatus, getOrderPackages, isTransactionReusedElsewhere } =
    await import("@/lib/orders.server");
  const { markCouponUsed } = await import("@/lib/coupons.server");

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return new Response("ok (empty body)", { status: 200 });
  }

  const signature =
    request.headers.get("x-sumit-signature") ||
    request.headers.get("x-webhook-signature") ||
    request.headers.get("signature");

  // verifySumitWebhookSignature returns true unconditionally when no
  // SUMIT_WEBHOOK_KEY is configured (documented as local/dev-only) — track
  // that distinction explicitly so an unset key in production never lets an
  // unsigned POST body be trusted as if it were verified.
  const webhookKeyConfigured = Boolean(process.env.SUMIT_WEBHOOK_KEY);
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

  console.log("[sumit-webhook] received", {
    transactionId,
    orderReference,
    webhookKeyConfigured,
  });
  console.log("[sumit-webhook] raw payload", JSON.stringify(payload));

  if (!transactionId && !orderReference) {
    // 200 so Sumit doesn't keep retrying a call we can't process.
    return new Response("ok (no identifiers)", { status: 200 });
  }

  // Recipient email, purchased package ids, and the applied coupon always
  // come from the order row recorded at checkout time — never from the
  // webhook payload's own email/package/coupon fields — so a forged or
  // misrouted POST to this URL can't claim a different recipient/package/
  // coupon than what was actually bought.
  const order = orderReference ? await getOrderPackages(orderReference) : null;

  // The signature check above only actually authenticates the payload when
  // SUMIT_WEBHOOK_KEY is configured; otherwise it's a no-op. A "paid"
  // determination must always come from an independent
  // verifySumitTransaction() call when the signature wasn't really checked.
  let validation: { paid: boolean; definitivelyFailed: boolean; status: string; raw: unknown } = {
    paid: false,
    definitivelyFailed: false,
    status: "unverified",
    raw: payload,
  };
  try {
    if (transactionId) {
      validation = await verifySumitTransaction(transactionId);
      if (validation.paid && orderReference) {
        const reused = await isTransactionReusedElsewhere(transactionId, orderReference);
        if (reused) {
          console.error(
            "[sumit-webhook] transaction id already applied to a different order — refusing",
            transactionId,
            orderReference,
          );
          validation = {
            paid: false,
            definitivelyFailed: true,
            status: "transaction_reused",
            raw: validation.raw,
          };
        }
      }
    }
  } catch (err) {
    console.error("[sumit-webhook] verify error", err);
    // Only trust this payload's own (already HMAC-verified) claim as a
    // fallback when the signature check actually authenticated it — never
    // when SUMIT_WEBHOOK_KEY is unset and the check above was a no-op.
    if (webhookKeyConfigured) {
      const { parseSumitTransactionStatus } = await import("@/lib/sumit.server");
      validation = parseSumitTransactionStatus(payload);
    }
  }

  // Neither confirmed paid nor confirmed failed: Sumit's verify endpoint
  // hasn't settled yet (or this webhook call carries no useful signal).
  // Leave the order and its emails alone — a retried webhook call or the
  // browser-return / confirm fallback will resolve it once it's known.
  const resolved = validation.paid || validation.definitivelyFailed;

  if (order && resolved) {
    try {
      await updateResendPaymentStatusByEmail(
        order.email,
        validation.paid ? "שולם" : "נכשל",
        order.packageIds,
      );
    } catch (err) {
      console.error("[sumit-webhook] Resend update error", err);
    }
  }

  if (orderReference && resolved) {
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

  if (validation.paid && order?.couponCode) {
    try {
      await markCouponUsed(order.couponCode);
    } catch (err) {
      console.error("[sumit-webhook] coupon mark-used error", err);
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
