import { createFileRoute } from "@tanstack/react-router";

// Temporary diagnostic + repair endpoint — lets an already-logged-in admin
// (a) fetch the raw Sumit gettransaction response for a specific transaction
// id, and (b) optionally reconcile a specific order that was mismarked
// "failed" by the credentials bug fixed alongside this endpoint (pass
// orderReference + email + packageIds + fix=1 to actually apply the
// correction — sets the order to paid and sends the customer their real
// welcome email(s), same as a successful webhook would have).
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

  const { verifySumitTransaction } = await import("@/lib/sumit.server");
  let validation: Awaited<ReturnType<typeof verifySumitTransaction>>;
  try {
    validation = await verifySumitTransaction(transactionId);
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }, null, 2), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const orderReference = url.searchParams.get("orderReference");
  const email = url.searchParams.get("email");
  const packageIdsParam = url.searchParams.get("packageIds");
  const shouldFix = url.searchParams.get("fix") === "1";

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
