import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { verifySumitTransactionWithRetry } = await import("@/lib/sumit.server");
  const { updateResendPaymentStatusByEmail } = await import("@/lib/resend.server");
  const { markOrderStatus, getOrderPackages, isTransactionReusedElsewhere } =
    await import("@/lib/orders.server");
  const { markCouponUsed } = await import("@/lib/coupons.server");

  const url = new URL(request.url);
  const params = url.searchParams;
  const orderReference = params.get("orderRef") || params.get("order_reference");
  const cancelled = params.get("cancelled") === "1";

  // Sumit appends its own identifiers on top of the ones we put in
  // RedirectURL/CancelRedirectURL — TransactionID (classic redirect) or the
  // valid=1/documentid pair (IPN-style redirect); documentid already flows
  // into transactionId below either way. This is an unsigned browser
  // redirect, not Sumit's signed server-to-server webhook — a "paid"
  // determination here must always come from an independent
  // verifySumitTransaction() call. A bare valid=1 flag with no transaction
  // id to verify is never trusted on its own.
  const transactionId =
    params.get("TransactionID") || params.get("ChargeID") || params.get("documentid");

  let verified: {
    paid: boolean;
    definitivelyFailed: boolean;
    status: string;
    raw: unknown;
  } | null = null;
  if (cancelled) {
    verified = {
      paid: false,
      definitivelyFailed: true,
      status: "cancelled",
      raw: Object.fromEntries(params.entries()),
    };
  } else if (transactionId) {
    try {
      // A short, bounded retry here (unlike the webhook's longer one) —
      // this delays the customer's actual browser redirect, so it trades a
      // couple of extra seconds for a real shot at resolving on the spot
      // instead of falling through to "pending" and depending on the
      // client-side poll or webhook to catch up later.
      verified = await verifySumitTransactionWithRetry(transactionId, 2, 1500);
      if (verified.paid && orderReference) {
        const reused = await isTransactionReusedElsewhere(transactionId, orderReference);
        if (reused) {
          console.error(
            "[sumit-return] transaction id already applied to a different order — refusing",
            transactionId,
            orderReference,
          );
          verified = {
            paid: false,
            definitivelyFailed: true,
            status: "transaction_reused",
            raw: verified.raw,
          };
        }
      }
    } catch (err) {
      console.error("[sumit-return] verify error — leaving order status for the webhook", err);
    }
  }
  // No transactionId and not cancelled: `verified` stays null (unknown) —
  // never marks the order paid or failed; the signed webhook (or the
  // confirmSumitPayment fallback on the success page) resolves it later.

  // Recipient email and purchased package ids always come from the order
  // row recorded at checkout time — never from client-supplied query
  // params — so this endpoint can't be used to claim a different (pricier)
  // package or a different recipient than what was actually bought.
  const order = orderReference ? await getOrderPackages(orderReference) : null;

  // Sumit's gettransaction endpoint has a real settlement lag right after a
  // redirect-flow checkout completes — verified.paid === false here often
  // just means "not confirmed yet", not "failed". Only email/update the
  // order when the outcome is actually known (paid, or a real confirmed
  // failure); otherwise leave it for a retry — see definitivelyFailed.
  const resolved = verified !== null && (verified.paid || verified.definitivelyFailed);

  if (resolved && order) {
    try {
      await updateResendPaymentStatusByEmail(
        order.email,
        verified!.paid ? "שולם" : "נכשל",
        order.packageIds,
      );
    } catch (err) {
      console.error("[sumit-return] Resend update error", err);
    }
  }

  if (resolved && orderReference) {
    try {
      await markOrderStatus({
        orderReference,
        transactionId,
        status: verified!.paid ? "paid" : "failed",
      });
    } catch (err) {
      console.error("[sumit-return] order status update error", err);
    }
  }

  if (verified?.paid && order?.couponCode) {
    try {
      await markCouponUsed(order.couponCode);
    } catch (err) {
      console.error("[sumit-return] coupon mark-used error", err);
    }
  }

  const redirectUrl = new URL("/payment/success", url.origin);
  const statusCode = !resolved ? "pending" : verified!.paid ? "0" : "99";
  redirectUrl.searchParams.set("statusCode", statusCode);
  if (transactionId) redirectUrl.searchParams.set("transactionId", transactionId);
  if (orderReference) redirectUrl.searchParams.set("orderRef", orderReference);
  if (cancelled)
    redirectUrl.searchParams.set("errorMessage", "העסקה בוטלה על ידך לפני השלמת התשלום.");

  return Response.redirect(redirectUrl.toString(), 302);
}

export const Route = createFileRoute("/api/public/sumit-return")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
