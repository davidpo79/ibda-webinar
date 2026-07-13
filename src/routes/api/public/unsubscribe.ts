import { createFileRoute } from "@tanstack/react-router";

function page(message: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charSet="utf-8" /><title>הסרה מרשימת התפוצה · IBDA</title></head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Lucida Grande','Lucida Sans Unicode',Arial,sans-serif;">
  <div style="max-width:480px;margin:80px auto;text-align:center;color:#333333;padding:0 24px;">
    <p style="font-size:16px;line-height:1.8;">${message}</p>
  </div>
</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function handle(request: Request) {
  const { verifyUnsubscribeToken } = await import("@/lib/unsubscribe.server");
  const { markContactUnsubscribed } = await import("@/lib/resend.server");

  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return page("קישור לא תקין.");
  }

  try {
    await markContactUnsubscribed(email);
  } catch (err) {
    console.error("[unsubscribe] failed", err);
    return page("אירעה תקלה. נסו שוב מאוחר יותר, או פנו אלינו ב-webinar@ibda-law.com.");
  }

  return page("הוסרת בהצלחה מרשימת התפוצה. לא תקבל/י מאיתנו מיילים נוספים.");
}

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
