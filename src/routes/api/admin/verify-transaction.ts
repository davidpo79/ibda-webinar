import { createFileRoute } from "@tanstack/react-router";

// Diagnostic + repair endpoint — lets an already-logged-in admin (a) fetch
// the raw Sumit gettransaction response for a specific transaction id
// (read-only, GET), and (b) optionally reconcile a specific order that was
// mismarked "failed" (POST with fix:true — sets the order to paid and sends
// the customer their real welcome email(s), same as a successful webhook
// would have). The mutating action is POST-only and requires an explicit
// confirm:true in the JSON body: the admin session cookie is SameSite=Lax,
// which still attaches on a cross-site top-level GET navigation (so a bare
// link/redirect could otherwise trigger this while an admin is logged in) —
// SameSite=Lax does NOT attach the cookie to a cross-site POST, and a JSON
// body can't be produced by a plain HTML form/link/img tag, closing that
// CSRF path.
//
// Sumit's /creditguy/gateway/gettransaction/ endpoint requires a genuinely
// separate "Public API Key" credential (Credentials.APIPublicKey, confirmed
// via Sumit's official Swagger docs) — not derivable from the existing
// private SUMIT_API_KEY. Until SUMIT_API_PUBLIC_KEY is configured with the
// real value from Sumit's dashboard, this call may still be rejected.
// forcePaid:true lets an admin who has independently confirmed the payment
// in Sumit's own dashboard apply the fix without depending on that endpoint.

async function requireAdmin(request: Request): Promise<Response | null> {
  const { parseCookie, isValidSessionCookie, ADMIN_COOKIE_NAME } =
    await import("@/lib/admin-auth.server");
  const cookieValue = parseCookie(request.headers.get("cookie"), ADMIN_COOKIE_NAME);
  if (!isValidSessionCookie(cookieValue)) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Read-only lookup: never mutates anything, so it's safe as a GET.
async function handleGet(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const transactionId = url.searchParams.get("transactionId");
  if (!transactionId) return new Response("missing transactionId", { status: 400 });

  const { verifySumitTransaction } = await import("@/lib/sumit.server");
  try {
    const validation = await verifySumitTransaction(transactionId);
    return jsonResponse(validation);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
}

// Mutating repair action — POST-only, requires an explicit confirm:true.
async function handlePost(request: Request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body: {
    transactionId?: string;
    orderReference?: string;
    email?: string;
    packageIds?: string[];
    forcePaid?: boolean;
    confirm?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  const { transactionId, orderReference, email, packageIds, forcePaid, confirm } = body;
  if (!transactionId || !orderReference || !email || !packageIds?.length) {
    return new Response("missing transactionId/orderReference/email/packageIds", { status: 400 });
  }
  if (confirm !== true) {
    return new Response("missing confirm:true — this action changes a real order's status", {
      status: 400,
    });
  }

  let validation: { paid: boolean; status: string; raw: unknown };
  if (forcePaid) {
    validation = { paid: true, status: "manually confirmed by admin", raw: null };
  } else {
    const { verifySumitTransaction } = await import("@/lib/sumit.server");
    try {
      validation = await verifySumitTransaction(transactionId);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  const { markOrderStatus } = await import("@/lib/orders.server");
  const { updateResendPaymentStatusByEmail } = await import("@/lib/resend.server");

  await markOrderStatus({
    orderReference,
    transactionId,
    status: validation.paid ? "paid" : "failed",
  });
  if (validation.paid) {
    await updateResendPaymentStatusByEmail(email, "שולם", packageIds);
  }

  console.log("[verify-transaction] admin repair applied", {
    orderReference,
    email,
    packageIds,
    forcePaid: Boolean(forcePaid),
    paid: validation.paid,
  });

  return jsonResponse({ validation, applied: { orderReference, email, packageIds } });
}

export const Route = createFileRoute("/api/admin/verify-transaction")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
