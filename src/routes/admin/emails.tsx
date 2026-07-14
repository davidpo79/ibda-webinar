import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getAdminEmailContentData, updateEmailContentAction } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/emails")({
  head: () => ({
    meta: [{ title: "עריכת מיילים · אדמין · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminEmailContentData();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminEmailsPage,
});

function AdminEmailsPage() {
  const router = useRouter();
  const { overrides, previews, packages, defaults } = Route.useLoaderData();

  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const pkg of packages) {
      map[`welcome.${pkg.id}.subject`] =
        overrides[`welcome.${pkg.id}.subject`] ?? defaults.welcomeSubject[pkg.id] ?? "";
      if (pkg.id !== "core_single") {
        map[`welcome.${pkg.id}.intro`] =
          overrides[`welcome.${pkg.id}.intro`] ?? defaults.welcomeIntro[pkg.id] ?? "";
      }
      map[`reminder.${pkg.id}.verb`] =
        overrides[`reminder.${pkg.id}.verb`] ?? defaults.reminderVerb[pkg.id] ?? "";
    }
    map["coupon.intro"] = overrides["coupon.intro"] ?? defaults.couponIntro;
    map["price_notice.intro"] = overrides["price_notice.intro"] ?? defaults.priceNoticeIntro;
    map["payment_status.paid.title"] =
      overrides["payment_status.paid.title"] ?? defaults.paymentStatusPaidTitle;
    map["payment_status.paid.body"] =
      overrides["payment_status.paid.body"] ?? defaults.paymentStatusPaidBody;
    map["payment_status.failed.title"] =
      overrides["payment_status.failed.title"] ?? defaults.paymentStatusFailedTitle;
    map["payment_status.failed.body"] =
      overrides["payment_status.failed.body"] ?? defaults.paymentStatusFailedBody;
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const previewByKey = useMemo(() => {
    const map: Record<string, (typeof previews)[number]> = {};
    for (const p of previews) map[p.key] = p;
    return map;
  }, [previews]);

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const changes: Record<string, string> = {};
      for (const [key, value] of Object.entries(values)) {
        if (value !== (initial[key] ?? "")) changes[key] = value;
      }
      if (Object.keys(changes).length) {
        await updateEmailContentAction({ data: { changes } });
      }
      setSaved(true);
      await router.invalidate();
    } catch (err) {
      console.error("[admin/emails] save failed", err);
      setError("שמירת התוכן נכשלה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  const activePreview = previewKey ? previewByKey[previewKey] : null;

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">עריכת תוכן מיילים</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה למסך הראשי
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <p className="text-muted-brown text-sm leading-relaxed">
            כאן ניתן לערוך את הכותרות והטקסטים של כל המיילים האוטומטיים שהמערכת שולחת. שדה שנשאר ריק
            חוזר לברירת המחדל. לחצו על "תצוגה מקדימה" ליד כל שדה כדי לראות את המייל בצד, בדיוק כפי
            שהוא נשלח בפועל.
          </p>

          {packages.map((pkg) => (
            <details key={pkg.id} className="glass-gold rounded-xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-gold">
                {pkg.label}
              </summary>
              <div className="space-y-4 mt-4">
                <Field
                  label="נושא מייל הברוכים הבאים"
                  value={values[`welcome.${pkg.id}.subject`] ?? ""}
                  onChange={(v) => setField(`welcome.${pkg.id}.subject`, v)}
                  onPreview={() => setPreviewKey(`welcome:${pkg.id}`)}
                />
                {pkg.id === "core_single" ? (
                  <p className="text-xs text-muted-brown">
                    פתיח מייל הברוכים הבאים לוובינר בודד נקבע אוטומטית לפי השיעור שנרכש, ואינו ניתן
                    לעריכה כאן.
                  </p>
                ) : (
                  <Field
                    label="פתיח מייל הברוכים הבאים"
                    value={values[`welcome.${pkg.id}.intro`] ?? ""}
                    onChange={(v) => setField(`welcome.${pkg.id}.intro`, v)}
                    onPreview={() => setPreviewKey(`welcome:${pkg.id}`)}
                    multiline
                  />
                )}
                <Field
                  label="ניסוח תזכורת יום לפני"
                  value={values[`reminder.${pkg.id}.verb`] ?? ""}
                  onChange={(v) => setField(`reminder.${pkg.id}.verb`, v)}
                  onPreview={() => setPreviewKey(`reminder:${pkg.id}`)}
                  hint='למשל: "מתחיל הוובינר שלנו"'
                />
              </div>
            </details>
          ))}

          <details className="glass-gold rounded-xl p-5">
            <summary className="cursor-pointer text-sm font-semibold text-gold">
              קוד הנחה אישי
            </summary>
            <div className="space-y-4 mt-4">
              <Field
                label="פתיח מייל קוד הנחה"
                value={values["coupon.intro"] ?? ""}
                onChange={(v) => setField("coupon.intro", v)}
                onPreview={() => setPreviewKey("coupon")}
                hint="ניתן להשתמש ב-{percent} כדי להציג את אחוז ההנחה"
                multiline
              />
            </div>
          </details>

          <details className="glass-gold rounded-xl p-5">
            <summary className="cursor-pointer text-sm font-semibold text-gold">
              התראת עליית מחיר
            </summary>
            <div className="space-y-4 mt-4">
              <Field
                label="פתיח מייל התראת מחיר"
                value={values["price_notice.intro"] ?? ""}
                onChange={(v) => setField("price_notice.intro", v)}
                onPreview={() => setPreviewKey("price_notice")}
                hint="ניתן להשתמש ב-{package}, {hours}, {price}"
                multiline
              />
            </div>
          </details>

          <details className="glass-gold rounded-xl p-5">
            <summary className="cursor-pointer text-sm font-semibold text-gold">
              אישור/כשל תשלום (גיבוי כללי)
            </summary>
            <div className="space-y-4 mt-4">
              <p className="text-xs text-muted-brown">
                נשלח רק כגיבוי, כשלא נמצאה הרשמה תואמת לחיוב — ברוב המקרים נשלח במקום זאת מייל
                ברוכים הבאים הספציפי לתוכנית שנרכשה.
              </p>
              <Field
                label="כותרת — תשלום הצליח"
                value={values["payment_status.paid.title"] ?? ""}
                onChange={(v) => setField("payment_status.paid.title", v)}
                onPreview={() => setPreviewKey("payment_status_paid")}
              />
              <Field
                label="גוף — תשלום הצליח"
                value={values["payment_status.paid.body"] ?? ""}
                onChange={(v) => setField("payment_status.paid.body", v)}
                onPreview={() => setPreviewKey("payment_status_paid")}
                multiline
              />
              <Field
                label="כותרת — תשלום נכשל"
                value={values["payment_status.failed.title"] ?? ""}
                onChange={(v) => setField("payment_status.failed.title", v)}
                onPreview={() => setPreviewKey("payment_status_failed")}
              />
              <Field
                label="גוף — תשלום נכשל"
                value={values["payment_status.failed.body"] ?? ""}
                onChange={(v) => setField("payment_status.failed.body", v)}
                onPreview={() => setPreviewKey("payment_status_failed")}
                multiline
              />
            </div>
          </details>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="bg-gold text-ink px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
            >
              {saving ? "שומר..." : "שמירת כל השינויים"}
            </button>
            {saved && !error && <span className="text-green-400 text-sm">נשמר בהצלחה</span>}
            {error && <span className="text-destructive text-sm">{error}</span>}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 self-start">
          <div className="glass-gold rounded-xl p-4 h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-cream">תצוגה מקדימה</h2>
              {activePreview && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-brown">{activePreview.label}</span>
                  <button
                    type="button"
                    onClick={() => setPreviewKey(null)}
                    aria-label="סגירת תצוגה מקדימה"
                    className="text-muted-brown hover:text-gold transition-colors text-lg leading-none w-5 h-5 flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            {activePreview ? (
              <>
                <div className="text-xs text-muted-brown mb-2">נושא: {activePreview.subject}</div>
                <iframe
                  title="email-preview"
                  srcDoc={activePreview.html}
                  sandbox=""
                  className="flex-1 w-full rounded-md bg-white border border-cream/15"
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-brown text-sm text-center px-6">
                לחצו על "תצוגה מקדימה" ליד אחד השדות כדי לראות את המייל כאן
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onPreview,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onPreview: () => void;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-muted-brown">{label}</span>
        <button type="button" onClick={onPreview} className="text-[11px] text-gold hover:underline">
          תצוגה מקדימה
        </button>
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
        />
      )}
      {hint && <span className="text-[11px] text-muted-brown mt-1 block">{hint}</span>}
    </label>
  );
}
