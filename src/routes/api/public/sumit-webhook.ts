import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { extractSumitEventTransactionId, extractSumitIdentifiers } =
    await import("@/lib/sumit-webhook-parse");
  const { verifySumitTransactionWithRetry, verifySumitWebhookSignature, getSumitDocumentDetails } =
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
  const { logSumitWebhookEvent, markWebhookLogOutcome } =
    await import("@/lib/sumit-webhook-log.server");

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

  let { transactionId, orderReference } = extractSumitIdentifiers(payload);

  // Neither of the usual identifiers — check whether this is the
  // accounting-document event shape instead. First try to recover the order
  // reference from a transaction id an earlier IPN already recorded onto an
  // order (recordObservedTransactionId below); if that comes up empty too —
  // e.g. this accounting event is the *only* webhook call Sumit ever sent
  // for this charge — fall back to asking Sumit directly for the document,
  // which carries back the order reference we set as Customer.ExternalIdentifier
  // at checkout time.
  if (!transactionId && !orderReference) {
    const eventTransactionId = extractSumitEventTransactionId(payload);
    if (eventTransactionId) {
      let matchedOrderReference = await findOrderReferenceByTransactionId(eventTransactionId);
      if (!matchedOrderReference) {
        try {
          const details = await getSumitDocumentDetails(eventTransactionId);
          matchedOrderReference = details.externalIdentifier;
        } catch (err) {
          console.error("[sumit-webhook] getdetails fallback failed", eventTransactionId, err);
        }
      }
      if (matchedOrderReference) {
        transactionId = eventTransactionId;
        orderReference = matchedOrderReference;
      }
    }
  }

  console.log("[sumit-webhook] received", {
    transactionId,
    orderReference,
    webhookKeyConfigured,
  });
  console.log("[sumit-webhook] raw payload", JSON.stringify(payload));

  const logId = await logSumitWebhookEvent({
    transactionId,
    orderReference,
    rawBody,
    parsedPayload: payload,
  }).catch((err) => {
    console.error("[sumit-webhook] log insert failed", err);
    return null;
  });

  if (!transactionId && !orderReference) {
    if (logId) await markWebhookLogOutcome(logId, "no_identifiers").catch(() => {});
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
  // Leave the order and its emails alone — a retried webhook call, the
  // periodic reconcile sweep (sumit-reconcile.server.ts), or the browser-
  // return / confirm fallback will resolve it once it's known.
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

  if (logId) {
    const outcome =
      validation.status === "transaction_reused"
        ? "transaction_reused"
        : validation.paid
          ? "paid"
          : validation.definitivelyFailed
            ? "failed"
            : "ambiguous";
    await markWebhookLogOutcome(logId, outcome).catch((err) => {
      console.error("[sumit-webhook] log outcome update failed", err);
    });
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
