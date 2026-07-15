import { createFileRoute } from "@tanstack/react-router";

// Sumit sends (at least) two distinct webhook shapes for the same
// redirect-flow checkout: the payment IPN ({valid, documentid, orderRef,
// ...} — carries our own identifiers, handled by the normal extraction
// above) and a separate accounting-document creation event ({Folder,
// EntityID, Type, Properties, ...}, arriving form-encoded as a single
// "json" field) that carries none of our identifiers, only Sumit's own
// EntityID for the document — which is the same id as the payment IPN's
// documentid/transactionId. Recognizing this second shape (instead of
// dropping it as "no identifiers") lets a stuck order get a second,
// later shot at resolving via the transaction id the first IPN already
// recorded onto it (see recordObservedTransactionId).
function extractSumitEventTransactionId(payload: Record<string, unknown>): string | null {
  const direct = payload as { EntityID?: unknown; Folder?: unknown };
  if (direct.EntityID != null && direct.Folder != null) return String(direct.EntityID);
  if (typeof payload.json === "string") {
    try {
      const inner = JSON.parse(payload.json) as { EntityID?: unknown; Folder?: unknown };
      if (inner.EntityID != null && inner.Folder != null) return String(inner.EntityID);
    } catch {
      // not the shape we're looking for — fall through to "no identifiers"
    }
  }
  return null;
}

async function handle(request: Request) {
  const { verifySumitTransactionWithRetry, verifySumitWebhookSignature } =
    await import("@/lib/sumit.server");
  const { updateResendPaymentStatusByEmail } = await import("@/lib/resend.server");
  const {
    markOrderStatus,
    getOrderPackages,
    isTransactionReusedElsewhere,
    recordObservedTransactionId,
    findOrderReferenceByTransactionId,
  } = await import("@/lib/orders.server");
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

  let transactionId =
    String(payload.TransactionID || payload.ChargeID || payload.documentid || "") || null;
  let orderReference =
    String(payload.ExternalIdentifier || payload.orderRef || payload.order_reference || "") || null;

  // Neither of the usual identifiers — check whether this is the
  // accounting-document event shape instead, and if so, try to recover the
  // order reference from a transaction id the first IPN already recorded.
  if (!transactionId && !orderReference) {
    const eventTransactionId = extractSumitEventTransactionId(payload);
    const matchedOrderReference = eventTransactionId
      ? await findOrderReferenceByTransactionId(eventTransactionId)
      : null;
    if (eventTransactionId && matchedOrderReference) {
      transactionId = eventTransactionId;
      orderReference = matchedOrderReference;
    }
  }

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

  // Record the transaction id against the order immediately, before
  // attempting verification below — so even if gettransaction is still
  // settling (or this call never resolves paid/failed at all), the order
  // isn't left with no transaction_id to re-check later.
  if (order && transactionId && orderReference) {
    try {
      await recordObservedTransactionId(orderReference, transactionId);
    } catch (err) {
      console.error("[sumit-webhook] record transaction id error", err);
    }
  }

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
      // This is the only confirmation path guaranteed to run regardless of
      // whether the customer's browser stays open — worth spending a few
      // extra seconds retrying through Sumit's settlement lag here rather
      // than depending entirely on the browser-return/client-poll fallback.
      // The default 3 attempts (~4-8s) has been observed to still be too
      // short: a real order's gettransaction call kept returning
      // "Transaction not found" for at least that long while a second,
      // independent Sumit webhook (the accounting-document event) proved
      // the charge had already settled. No customer is waiting on this
      // response, so it can afford to be considerably more patient.
      validation = await verifySumitTransactionWithRetry(transactionId, 6, 4000);
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
