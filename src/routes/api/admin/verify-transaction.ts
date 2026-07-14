import { createFileRoute } from "@tanstack/react-router";

// Temporary diagnostic + repair endpoint — lets an already-logged-in admin
// (a) fetch the raw Sumit gettransaction response for a specific transaction
// id, and (b) optionally reconcile a specific order that was mismarked
// "failed" (pass orderReference + email + packageIds + fix=1 to apply the
// correction — sets the order to paid and sends the customer their real
// welcome email(s), same as a successful webhook would have).
//
// Sumit's /creditguy/gateway/gettransaction/ endpoint requires a genuinely
// separate "Public API Key" credential (Credentials.APIPublicKey, confirmed
// via Sumit's official Swagger docs) — not derivable from the existing
// private SUMIT_API_KEY. Until SUMIT_API_PUBLIC_KEY is configured with the
// real value from Sumit's dashboard, this call may still be rejected.
// forcePaid=1 lets an admin who has independently confirmed the payment in
// Sumit's own dashboard apply the fix without depending on that endpoint at
// all.
async function handle(request: Request) {
  const { parseCookie, isValidSessionCookie, ADMIN_COOKIE_NAME } =
    await import("@/lib/admin-auth.server");
  const cookieValue = parseCookie(request.headers.get("cookie"), ADMIN_COOKIE_NAME);
  if (!isValidSessionCookie(cookieValue)) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const transactionId = url.searchParams.get("transactionId");
  if (!transactionId) {
    return new Response("missing transactionId", { status: 400 });
  }

  const orderReference = url.searchParams.get("orderReference");
  const email = url.searchParams.get("email");
  const packageIdsParam = url.searchParams.get("packageIds");
  const shouldFix = url.searchParams.get("fix") === "1";
  const forcePaid = url.searchParams.get("forcePaid") === "1";

  let validation: { paid: boolean; status: string; raw: unknown };
  if (forcePaid) {
    validation = { paid: true, status: "manually confirmed by admin", raw: null };
  } else {
    const { verifySumitTransaction } = await import("@/lib/sumit.server");
    try {
      validation = await verifySumitTransaction(transactionId);
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }, null, 2), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }

  if (!shouldFix || !orderReference || !email || !packageIdsParam) {
    return new Response(JSON.stringify(validation, null, 2), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const { markOrderStatus } = await import("@/lib/orders.server");
  const { updateResendPaymentStatusByEmail } = await import("@/lib/resend.server");
  const packageIds = packageIdsParam.split(",").filter(Boolean);

  await markOrderStatus({
    orderReference,
    transactionId,
    status: validation.paid ? "paid" : "failed",
  });
  if (validation.paid) {
    await updateResendPaymentStatusByEmail(email, "שולם", packageIds);
  }

  return new Response(
    JSON.stringify({ validation, applied: { orderReference, email, packageIds } }, null, 2),
    { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/admin/verify-transaction")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
