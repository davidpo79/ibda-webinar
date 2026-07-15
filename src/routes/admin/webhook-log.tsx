import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { getAdminWebhookLogData, runSumitReconcileNowAction } from "@/lib/admin.functions";
import { formatSessionDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/webhook-log")({
  head: () => ({
    meta: [{ title: "יומן סליקה · אדמין · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminWebhookLogData();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminWebhookLogPage,
});

const OUTCOME_LABELS: Record<string, { label: string; className: string }> = {
  paid: { label: "שולם", className: "bg-green-500/15 border-green-500/40 text-green-400" },
  failed: { label: "נכשל", className: "bg-destructive/15 border-destructive/40 text-destructive" },
  ambiguous: { label: "לא ברור — ינוסה שוב", className: "bg-gold/15 border-gold/40 text-gold" },
  transaction_reused: {
    label: "עסקה בשימוש כפול",
    className: "bg-destructive/15 border-destructive/40 text-destructive",
  },
  no_identifiers: {
    label: "אין מזהים",
    className: "bg-cream/10 border-cream/20 text-muted-brown",
  },
};

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const info = outcome ? OUTCOME_LABELS[outcome] : null;
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap",
        info?.className ?? "bg-cream/10 border-cream/20 text-muted-brown",
      )}
    >
      {info?.label ?? outcome ?? "ממתין"}
    </span>
  );
}

function AdminWebhookLogPage() {
  const router = useRouter();
  const { logs } = Route.useLoaderData();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reconciling, setReconciling] = useState(false);

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function onReconcileNow() {
    setReconciling(true);
    try {
      const result = await runSumitReconcileNowAction();
      toast.success(
        `נבדקו ${result.scanned} רשומות, ${result.recovered} שוחזרו${result.errors ? `, ${result.errors} שגיאות` : ""}`,
      );
      await router.invalidate();
    } catch (err) {
      console.error("[admin/webhook-log] reconcile now failed", err);
      toast.error("הרצת הפישוק נכשלה. נסו שוב.");
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">יומן וובהוקים של סאמיט</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה למסך הראשי
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <p className="text-muted-brown text-sm leading-relaxed">
          כל קריאת וובהוק מסאמיט שעברה את בדיקת החתימה נרשמת כאן — גם אם לא ניתן היה לפענח ממנה
          הזמנה. רשומות שלא נפתרו (&quot;לא ברור&quot;) מנוסות שוב אוטומטית בכל סבב אוטומציה (כל 10
          דקות), עד תקרה של כמה ניסיונות.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReconcileNow}
            disabled={reconciling}
            className="bg-gold text-ink px-4 py-2 rounded-md text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
          >
            {reconciling ? "מריץ..." : "הרץ פישוק עכשיו"}
          </button>
        </div>

        <div className="overflow-x-auto glass-gold rounded-xl">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-right text-muted-brown border-b border-cream/10">
                <th className="px-4 py-3 font-medium">התקבל</th>
                <th className="px-4 py-3 font-medium">מזהה עסקה</th>
                <th className="px-4 py-3 font-medium">מספר הזמנה</th>
                <th className="px-4 py-3 font-medium">תוצאה</th>
                <th className="px-4 py-3 font-medium">ניסיונות</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => {
                const isOpen = expanded.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr className="border-t border-cream/10">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-brown">
                        {formatSessionDate(row.received_at) || "—"}
                      </td>
                      <td className="px-4 py-3 ltr-inline">{row.transaction_id || "—"}</td>
                      <td className="px-4 py-3 ltr-inline break-all">
                        {row.order_reference || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <OutcomeBadge outcome={row.outcome} />
                      </td>
                      <td className="px-4 py-3 text-muted-brown">{row.reconcile_attempts}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          className="text-gold text-xs hover:underline"
                        >
                          {isOpen ? "הסתרה" : "מטען גולמי"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-cream/5 bg-ink/40">
                        <td colSpan={6} className="px-4 py-3">
                          <pre className="text-xs text-muted-brown whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                            {row.parsed_payload
                              ? JSON.stringify(JSON.parse(row.parsed_payload), null, 2)
                              : row.raw_body}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-brown">
                    עדיין לא התקבלו וובהוקים
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
