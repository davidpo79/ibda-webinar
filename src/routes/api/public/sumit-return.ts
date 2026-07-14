import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { parseSumitTransactionStatus, verifySumitTransaction } =
    await import("@/lib/sumit.server");
  const { updateResendPaymentStatusByEmail } = await import("@/lib/resend.server");
  const { markOrderStatus } = await import("@/lib/orders.server");
  const { markCouponUsed } = await import("@/lib/coupons.server");

  const url = new URL(request.url);
  const params = url.searchParams;
  const orderReference = params.get("orderRef") || params.get("order_reference");
  const cancelled = params.get("cancelled") === "1";
  const couponCode = params.get("coupon");

  // Sumit appends its own identifiers on top of the ones we put in
  // RedirectURL/CancelRedirectURL — TransactionID (classic redirect) or the
  // valid=1/documentid pair (IPN-style redirect). Accept both.
  const transactionId =
    params.get("TransactionID") || params.get("ChargeID") || params.get("documentid");
  const validFlag = params.get("valid");
  const email = params.get("email");
  // Comma-joined when the purchase covered several packages at once.
  const packageId = params.get("package");
  const packageIds = packageId ? packageId.split(",").filter(Boolean) : [];

  let validation = parseSumitTransactionStatus(Object.fromEntries(params.entries()));
  if (cancelled) {
    validation = { paid: false, status: "cancelled", raw: Object.fromEntries(params.entries()) };
  } else {
    try {
      if (transactionId) {
        validation = await verifySumitTransaction(transactionId);
      } else if (validFlag === "1") {
        validation = { paid: true, status: "valid", raw: Object.fromEntries(params.entries()) };
      }
    } catch (err) {
      console.error("[sumit-return] verify error", err);
    }
  }

  if (email) {
    try {
      await updateResendPaymentStatusByEmail(email, validation.paid ? "שולם" : "נכשל", packageIds);
    } catch (err) {
      console.error("[sumit-return] Resend update error", err);
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
      console.error("[sumit-return] order status update error", err);
    }
  }

  if (validation.paid && couponCode) {
    try {
      await markCouponUsed(couponCode);
    } catch (err) {
      console.error("[sumit-return] coupon mark-used error", err);
    }
  }

  const redirectUrl = new URL("/payment/success", url.origin);
  redirectUrl.searchParams.set("statusCode", validation.paid ? "0" : "99");
  if (transactionId) redirectUrl.searchParams.set("transactionId", transactionId);
  if (orderReference) redirectUrl.searchParams.set("orderRef", orderReference);
  if (email) redirectUrl.searchParams.set("email", email);
  if (packageId) redirectUrl.searchParams.set("package", packageId);
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
