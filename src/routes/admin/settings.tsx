import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getAdminEmailPolicyData, updateEmailSendPolicyAction } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "הגדרות מייל · אדמין · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminEmailPolicyData();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminSettingsPage,
});

const WEEKDAYS = [
  { value: 0, label: "ראשון" },
  { value: 1, label: "שני" },
  { value: 2, label: "שלישי" },
  { value: 3, label: "רביעי" },
  { value: 4, label: "חמישי" },
  { value: 5, label: "שישי" },
  { value: 6, label: "שבת" },
];

function AdminSettingsPage() {
  const router = useRouter();
  const { policy } = Route.useLoaderData();
  const [blockedWeekdays, setBlockedWeekdays] = useState<Set<number>>(
    new Set(policy.blocked_weekdays),
  );
  const [allowedHourStart, setAllowedHourStart] = useState(String(policy.allowed_hour_start));
  const [allowedHourEnd, setAllowedHourEnd] = useState(String(policy.allowed_hour_end));
  const [blockedDates, setBlockedDates] = useState<string[]>(policy.blocked_dates);
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleWeekday(v: number) {
    setBlockedWeekdays((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
    setSaved(false);
  }

  function addDate() {
    if (!newDate || blockedDates.includes(newDate)) return;
    setBlockedDates((d) => [...d, newDate].sort());
    setNewDate("");
    setSaved(false);
  }

  function removeDate(date: string) {
    setBlockedDates((d) => d.filter((x) => x !== date));
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateEmailSendPolicyAction({
        data: {
          blockedWeekdays: Array.from(blockedWeekdays),
          allowedHourStart: Number(allowedHourStart),
          allowedHourEnd: Number(allowedHourEnd),
          blockedDates,
        },
      });
      setSaved(true);
      await router.invalidate();
    } catch (err) {
      console.error("[admin/settings] save failed", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">הגדרות שליחת מיילים</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה ללידים ולרוכשים
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <p className="text-muted-brown text-sm leading-relaxed">
          שולט מתי מיילים אוטומטיים (תזכורות לפני מפגש, התראות עליית מחיר) מותר להישלח. מיילים
          שמגיעים מפעולה ישירה של המשתמש (אישור הרשמה, אישור תשלום) לא מושפעים מהגדרה זו.
        </p>

        <section className="glass-gold rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-cream mb-3">ימים חסומים לשליחה</h2>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const blocked = blockedWeekdays.has(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeekday(d.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors",
                      blocked
                        ? "bg-destructive/15 border-destructive/40 text-destructive"
                        : "bg-ink/40 border-cream/15 text-muted-brown hover:border-gold/40",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="text-[12px] text-muted-brown mb-1 block">שעת התחלה מותרת</span>
              <input
                type="number"
                min={0}
                max={23}
                value={allowedHourStart}
                onChange={(e) => {
                  setAllowedHourStart(e.target.value);
                  setSaved(false);
                }}
                className="w-24 bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold ltr-inline"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-muted-brown mb-1 block">שעת סיום מותרת</span>
              <input
                type="number"
                min={1}
                max={24}
                value={allowedHourEnd}
                onChange={(e) => {
                  setAllowedHourEnd(e.target.value);
                  setSaved(false);
                }}
                className="w-24 bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold ltr-inline"
              />
            </label>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-cream mb-3">חגים / תאריכים חסומים נוספים</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {blockedDates.map((d) => (
                <span
                  key={d}
                  className="flex items-center gap-2 bg-ink/40 border border-cream/15 rounded-md px-3 py-1.5 text-xs ltr-inline"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => removeDate(d)}
                    className="text-destructive hover:underline"
                  >
                    הסרה
                  </button>
                </span>
              ))}
              {blockedDates.length === 0 && (
                <span className="text-muted-brown text-xs">אין תאריכים חסומים</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
              />
              <button
                type="button"
                onClick={addDate}
                disabled={!newDate}
                className="border border-gold/50 text-gold px-4 py-2 rounded-md text-xs font-semibold hover:bg-gold/10 transition-colors disabled:opacity-50"
              >
                הוספה
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="bg-gold text-ink px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
            >
              {saving ? "שומר..." : "שמירה"}
            </button>
            {saved && <span className="text-green-400 text-sm">נשמר בהצלחה</span>}
          </div>
        </section>
      </main>
    </div>
  );
}
