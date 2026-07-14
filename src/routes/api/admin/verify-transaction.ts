import { createFileRoute } from "@tanstack/react-router";

// Temporary diagnostic endpoint — lets an already-logged-in admin fetch the
// raw Sumit gettransaction response for a specific transaction id, to debug
// cases where our paid/failed detection disagrees with what Sumit's own
// dashboard shows. Requires the admin session cookie, same as every other
// /admin/* page.
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
  try {
    const validation = await verifySumitTransaction(transactionId);
    return new Response(JSON.stringify(validation, null, 2), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }, null, 2), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

export const Route = createFileRoute("/api/admin/verify-transaction")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
