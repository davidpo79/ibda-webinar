import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getAdminPricingData, updatePackagePricingAction } from "@/lib/admin.functions";
import {
  formatSessionDate,
  isoToIsraelDatetimeLocal,
  israelDatetimeLocalToISOString,
} from "@/lib/format-date";

export const Route = createFileRoute("/admin/pricing")({
  head: () => ({
    meta: [{ title: "ניהול מחירים · אדמין · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminPricingData();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminPricingPage,
});

const PACKAGE_LABELS: Record<string, string> = {
  core_single: "וובינר בודד",
  core_full: "הסדרה המלאה",
  premium_litigation: "סדנת ליטיגציה",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום",
};

function AdminPricingPage() {
  const router = useRouter();
  const { pricing } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">ניהול מחירים</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה ללידים ולרוכשים
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-muted-brown text-sm mb-8 leading-relaxed">
          לכל מוצר יש מחיר מוקדם (מה שנגבה כרגע) ומחיר רגיל. אם מגדירים &quot;מועד עליית מחיר&quot;,
          החל מאותו רגע המחיר בפועל עובר אוטומטית למחיר הרגיל, וכל הלידים שבחרו את המוצר ועדיין לא
          שילמו יקבלו מייל אוטומטי כ-12 שעות לפני כן. השארת השדה ריק אומרת שהמחיר המוקדם נשאר בתוקף
          ללא הגבלת זמן.
        </p>

        <div className="border border-cream/10 rounded-lg divide-y divide-cream/10 overflow-hidden">
          {pricing.map((p) => (
            <PricingRow
              key={p.package_id}
              row={p}
              label={PACKAGE_LABELS[p.package_id] || p.package_id}
              onSaved={() => router.invalidate()}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function PricingRow({
  row,
  label,
  onSaved,
}: {
  row: {
    package_id: string;
    early_price: string;
    regular_price: string;
    cutoff_at: string | null;
    price_increase_notified_at: string | null;
  };
  label: string;
  onSaved: () => void;
}) {
  const [earlyPrice, setEarlyPrice] = useState(row.early_price);
  const [regularPrice, setRegularPrice] = useState(row.regular_price);
  const [cutoffAt, setCutoffAt] = useState(
    row.cutoff_at ? isoToIsraelDatetimeLocal(row.cutoff_at) : "",
  );
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    try {
      await updatePackagePricingAction({
        data: {
          packageId: row.package_id,
          earlyPrice: Number(earlyPrice),
          regularPrice: Number(regularPrice),
          cutoffAt: cutoffAt ? israelDatetimeLocalToISOString(cutoffAt) : null,
        },
      });
      onSaved();
    } catch (err) {
      console.error("[admin/pricing] save failed", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-4 flex flex-wrap items-end gap-4">
      <div className="font-medium text-cream min-w-[160px]">{label}</div>
      <label className="block">
        <span className="text-[12px] text-muted-brown mb-1 block">מחיר מוקדם</span>
        <input
          type="number"
          value={earlyPrice}
          onChange={(e) => setEarlyPrice(e.target.value)}
          className="w-28 bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold ltr-inline"
        />
      </label>
      <label className="block">
        <span className="text-[12px] text-muted-brown mb-1 block">מחיר רגיל</span>
        <input
          type="number"
          value={regularPrice}
          onChange={(e) => setRegularPrice(e.target.value)}
          className="w-28 bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold ltr-inline"
        />
      </label>
      <label className="block">
        <span className="text-[12px] text-muted-brown mb-1 block">מועד עליית מחיר</span>
        <input
          type="datetime-local"
          value={cutoffAt}
          onChange={(e) => setCutoffAt(e.target.value)}
          className="bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
        />
      </label>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="bg-gold text-ink px-4 py-2 rounded-md text-xs font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
      >
        {saving ? "שומר..." : "שמירה"}
      </button>
      <span className="text-[11px] text-muted-brown">
        {row.price_increase_notified_at
          ? `נשלחה התראה ב-${formatSessionDate(row.price_increase_notified_at)}`
          : "טרם נשלחה התראה"}
      </span>
    </div>
  );
}
