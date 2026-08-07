import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { getAdminFunnelStatsAction } from "@/lib/admin.functions";
import type { CheckoutFunnelStats } from "@/lib/orders.server";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [{ title: "נתוני המרה · אדמין · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminFunnelStatsAction({ data: { sinceDays: 30 } });
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminAnalyticsPage,
});

const PACKAGE_LABELS: Record<string, string> = {
  core_full: "הסדרה המלאה",
  core_single: "וובינר בודד",
  premium_litigation: "סדנת ליטיגציה",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום",
};

const RANGES: { label: string; sinceDays: number | null }[] = [
  { label: "7 ימים", sinceDays: 7 },
  { label: "30 יום", sinceDays: 30 },
  { label: "90 יום", sinceDays: 90 },
  { label: "כל הזמן", sinceDays: null },
];

function pct(paid: number, checkouts: number): string {
  if (checkouts === 0) return "-";
  return `${Math.round((paid / checkouts) * 1000) / 10}%`;
}

function AdminAnalyticsPage() {
  const initial = Route.useLoaderData();
  const [stats, setStats] = useState<CheckoutFunnelStats>(initial);
  const [activeDays, setActiveDays] = useState<number | null>(30);
  const [loading, setLoading] = useState(false);
  const [adSpend, setAdSpend] = useState("");

  async function loadRange(sinceDays: number | null) {
    setActiveDays(sinceDays);
    setLoading(true);
    try {
      const result = await getAdminFunnelStatsAction({ data: { sinceDays } });
      setStats(result);
    } catch (err) {
      console.error("[admin/analytics] load failed", err);
    } finally {
      setLoading(false);
    }
  }

  const spend = Number(adSpend);
  const hasSpend = adSpend.trim() !== "" && Number.isFinite(spend) && spend > 0;
  const cpa = hasSpend && stats.paid > 0 ? spend / stats.paid : null;
  const days = activeDays ?? 90;
  const dailyPurchaseRate = stats.paid / days;

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">נתוני המרה</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה למסך הראשי
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <p className="text-muted-brown text-sm leading-relaxed">
          יחס תשלום הזמנה שנפתחה (checkout) בפועל, מחושב ישירות מההזמנות באתר - לא מנתוני Meta, ולכן
          תקף גם למי שלא הגיע דרך פרסום ממומן. זה בדיוק היחס שקובע כמה עולה רכישה בפועל, ולכן גם כמה
          תקציב יומי הגיוני להגדיר לקמפיין שמותאם ל-Purchase.
        </p>

        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => loadRange(r.sinceDays)}
              disabled={loading}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                activeDays === r.sinceDays
                  ? "bg-gold text-ink"
                  : "bg-cream/5 text-muted-brown hover:bg-cream/10"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-gold rounded-xl p-5">
            <div className="text-xs text-muted-brown mb-1">הזמנות שנפתחו</div>
            <div className="text-3xl font-serif text-cream">{stats.checkouts}</div>
          </div>
          <div className="glass-gold rounded-xl p-5">
            <div className="text-xs text-muted-brown mb-1">שולמו</div>
            <div className="text-3xl font-serif text-gold">{stats.paid}</div>
            <div className="text-xs text-muted-brown mt-1">{pct(stats.paid, stats.checkouts)}</div>
          </div>
          <div className="glass-gold rounded-xl p-5">
            <div className="text-xs text-muted-brown mb-1">הכנסה</div>
            <div className="text-3xl font-serif text-cream">
              ₪{Math.round(stats.revenue).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto glass-gold rounded-xl">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-right text-muted-brown border-b border-cream/10">
                <th className="px-4 py-3 font-medium">מוצר</th>
                <th className="px-4 py-3 font-medium">נפתחו</th>
                <th className="px-4 py-3 font-medium">שולמו</th>
                <th className="px-4 py-3 font-medium">יחס המרה</th>
                <th className="px-4 py-3 font-medium">הכנסה</th>
              </tr>
            </thead>
            <tbody>
              {stats.byPackage.map((row) => (
                <tr key={row.package_id} className="border-t border-cream/10">
                  <td className="px-4 py-3">{PACKAGE_LABELS[row.package_id] || row.package_id}</td>
                  <td className="px-4 py-3">{row.checkouts}</td>
                  <td className="px-4 py-3 text-gold">{row.paid}</td>
                  <td className="px-4 py-3">{pct(row.paid, row.checkouts)}</td>
                  <td className="px-4 py-3">₪{Math.round(row.revenue).toLocaleString()}</td>
                </tr>
              ))}
              {stats.byPackage.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-brown">
                    אין הזמנות בתקופה שנבחרה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-gold rounded-xl p-6 space-y-4">
          <h2 className="font-serif text-lg text-gold">מחשבון תקציב לקמפיין Purchase</h2>
          <p className="text-muted-brown text-xs leading-relaxed">
            הזינו כמה כסף הוצאתם בפועל על פרסום בתקופה שנבחרה למעלה (בכל הפלטפורמות שהובילו לעמוד
            הזה), ותקבלו עלות-לרכישה אמיתית ותקציב יומי מומלץ - לא הערכה.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <div className="text-muted-brown mb-1">הוצאת פרסום בתקופה (₪)</div>
              <input
                type="number"
                min="0"
                value={adSpend}
                onChange={(e) => setAdSpend(e.target.value)}
                className="bg-ink border border-cream/20 rounded-md px-3 py-2 w-40 text-cream"
                placeholder="0"
              />
            </label>
          </div>
          {hasSpend && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <div className="text-xs text-muted-brown mb-1">עלות לרכישה (CPA)</div>
                <div className="text-xl font-serif text-cream">
                  {cpa !== null ? `₪${Math.round(cpa).toLocaleString()}` : "אין עדיין רכישות"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-brown mb-1">קצב רכישות יומי בפועל</div>
                <div className="text-xl font-serif text-cream">
                  {Math.round(dailyPurchaseRate * 100) / 100} / יום
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-brown mb-1">תקציב יומי מומלץ (Purchase)</div>
                <div className="text-xl font-serif text-gold">
                  {cpa !== null ? `₪${Math.round(cpa * 10).toLocaleString()}` : "-"}
                </div>
              </div>
            </div>
          )}
          <p className="text-muted-brown text-[11px] leading-relaxed">
            כלל האצבע: תקציב יומי שווה פי 10 מה-CPA, כדי לתת לאלגוריתם של Meta מספיק רכישות ביום
            לצאת משלב הלמידה (יעד: כ-50 רכישות בשבוע ברמת קבוצת המודעות). אם ה-CPA כאן נמדד על תקופה
            קצרה או על מעט רכישות, קחו אותו כהערכה ראשונית ולא כמספר סופי.
          </p>
        </div>
      </main>
    </div>
  );
}
