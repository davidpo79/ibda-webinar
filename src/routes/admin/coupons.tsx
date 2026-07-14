import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  getAdminCouponsData,
  createGenericCouponAction,
  setCouponActiveAction,
} from "@/lib/admin.functions";
import { formatSessionDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/coupons")({
  head: () => ({
    meta: [{ title: "קופונים · אדמין · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminCouponsData();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminCouponsPage,
});

function AdminCouponsPage() {
  const router = useRouter();
  const { coupons } = Route.useLoaderData();
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("15");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const genericCoupons = coupons.filter((c) => !c.registration_id);
  const leadCoupons = coupons.filter((c) => c.registration_id);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createGenericCouponAction({
        data: { code: code.trim(), discountPercent: Number(discount) },
      });
      setCode("");
      await router.invalidate();
    } catch (err) {
      console.error("[admin/coupons] create failed", err);
      setError("יצירת הקופון נכשלה — ייתכן שהקוד כבר קיים");
    } finally {
      setCreating(false);
    }
  }

  async function onToggleActive(id: string, active: boolean) {
    try {
      await setCouponActiveAction({ data: { id, active } });
      await router.invalidate();
    } catch (err) {
      console.error("[admin/coupons] toggle failed", err);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">קופוני הנחה</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה למסך הראשי
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-12">
        <section>
          <h2 className="font-serif text-lg text-gold mb-4">יצירת קוד כללי (לשימוש חוזר)</h2>
          <form
            onSubmit={onCreate}
            className="glass-gold rounded-xl p-6 flex flex-wrap items-end gap-4"
          >
            <label className="block flex-1 min-w-[160px]">
              <span className="text-sm font-semibold text-cream mb-2 block">קוד</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SUMMER15"
                className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold ltr-inline"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-cream mb-2 block">אחוז הנחה</span>
              <select
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold"
              >
                {[10, 15, 20, 25, 30, 40, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={creating}
              className="btn-shimmer bg-gold text-ink px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-gold-deep transition-all duration-300 disabled:opacity-60"
            >
              <span className="relative z-10">{creating ? "יוצר..." : "יצירה"}</span>
            </button>
          </form>
          {error && <p className="text-destructive text-xs mt-2">{error}</p>}
        </section>

        <section>
          <h2 className="font-serif text-lg text-gold mb-4">קודים כלליים</h2>
          <CouponTable coupons={genericCoupons} onToggleActive={onToggleActive} />
        </section>

        <section>
          <h2 className="font-serif text-lg text-gold mb-4">קודים אישיים שנשלחו ללידים</h2>
          <p className="text-muted-brown text-sm mb-4">
            נוצרים מתוך עמוד הלידים הראשי, בכפתור &quot;שליחת קוד הנחה&quot; בפרטי הליד. חד-פעמיים —
            נסמנים כמנוצלים אוטומטית ברגע שהתשלום עם הקוד מאושר.
          </p>
          <CouponTable coupons={leadCoupons} onToggleActive={onToggleActive} />
        </section>
      </main>
    </div>
  );
}

function CouponTable({
  coupons,
  onToggleActive,
}: {
  coupons: {
    id: string;
    code: string;
    discount_percent: number;
    active: boolean;
    used_at: string | null;
    created_at: string;
  }[];
  onToggleActive: (id: string, active: boolean) => void;
}) {
  if (coupons.length === 0) {
    return (
      <div className="border border-cream/10 rounded-lg px-4 py-6 text-center text-muted-brown text-sm">
        אין קופונים
      </div>
    );
  }

  function toggle(c: { id: string; code: string; active: boolean }) {
    const action = c.active ? "כיבוי" : "הפעלה";
    if (!window.confirm(`${action} של הקוד ${c.code}?`)) return;
    onToggleActive(c.id, !c.active);
  }

  return (
    <>
      <div className="hidden md:block border border-cream/10 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-sand/70 text-right">
            <tr>
              <th className="px-4 py-3 font-semibold">קוד</th>
              <th className="px-4 py-3 font-semibold">הנחה</th>
              <th className="px-4 py-3 font-semibold">נוצר</th>
              <th className="px-4 py-3 font-semibold">נוצל</th>
              <th className="px-4 py-3 font-semibold">פעיל</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-cream/10">
                <td className="px-4 py-3 font-medium">
                  <span className="ltr-inline">{c.code}</span>
                </td>
                <td className="px-4 py-3">{c.discount_percent}%</td>
                <td className="px-4 py-3 text-muted-brown whitespace-nowrap">
                  {formatSessionDate(c.created_at)}
                </td>
                <td className="px-4 py-3 text-muted-brown whitespace-nowrap">
                  {c.used_at ? formatSessionDate(c.used_at) : "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-semibold",
                      c.active ? "bg-green-500/15 text-green-400" : "bg-cream/10 text-muted-brown",
                    )}
                  >
                    {c.active ? "פעיל" : "כבוי"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {coupons.map((c) => (
          <div key={c.id} className="border border-cream/10 rounded-lg p-4 bg-ink/20">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-cream ltr-inline break-all">{c.code}</div>
                <div className="text-muted-brown text-sm mt-1">{c.discount_percent}% הנחה</div>
              </div>
              <button
                type="button"
                onClick={() => toggle(c)}
                className={cn(
                  "shrink-0 px-2 py-1 rounded text-xs font-semibold",
                  c.active ? "bg-green-500/15 text-green-400" : "bg-cream/10 text-muted-brown",
                )}
              >
                {c.active ? "פעיל" : "כבוי"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-brown">
              <span className="whitespace-nowrap">נוצר: {formatSessionDate(c.created_at)}</span>
              <span className="whitespace-nowrap">
                נוצל: {c.used_at ? formatSessionDate(c.used_at) : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
