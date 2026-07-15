import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getAdminEmailContentData, updateEmailContentAction } from "@/lib/admin.functions";
import { escapeHtml } from "@/lib/escape-html";

// Which editable field(s) affect a given preview's rendered body — used to
// patch the server-fetched preview HTML live as the admin types, without a
// round trip. Every one of these fields is HTML-escaped server-side before
// being embedded (see email-templates.server.ts / coupons.server.ts /
// pricing-notices.server.ts / resend.server.ts), so the same escaping is
// applied here before the string replace.
function fieldsForPreviewKey(previewKey: string): string[] {
  if (previewKey.startsWith("welcome:")) {
    const pkgId = previewKey.slice("welcome:".length);
    return pkgId === "core_single" ? [] : [`welcome.${pkgId}.intro`];
  }
  if (previewKey.startsWith("reminder:")) {
    return [`reminder.${previewKey.slice("reminder:".length)}.verb`];
  }
  if (previewKey === "coupon") return ["coupon.intro"];
  if (previewKey === "price_notice") return ["price_notice.intro"];
  if (previewKey === "payment_status_paid") {
    return ["payment_status.paid.title", "payment_status.paid.body"];
  }
  if (previewKey === "payment_status_failed") {
    return ["payment_status.failed.title", "payment_status.failed.body"];
  }
  return [];
}

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

const SAVE_WARNING =
  "השינוי יתעדכן מיד בריסנד (Resend) ויחול על כל המיילים שיישלחו ללקוחות הבאים, החל מהרגע הזה.";

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
  // The last value actually persisted (from the initial load, or a
  // successful per-field/bulk save) — compared against `values` to know
  // which fields are dirty and what a "save all" should send.
  const [baseline, setBaseline] = useState<Record<string, string>>(initial);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const previewByKey = useMemo(() => {
    const map: Record<string, (typeof previews)[number]> = {};
    for (const p of previews) map[p.key] = p;
    return map;
  }, [previews]);

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setSavedKeys((s) => {
      if (!s.has(key)) return s;
      const n = new Set(s);
      n.delete(key);
      return n;
    });
    setErrorByKey((e) => {
      if (!(key in e)) return e;
      const n = { ...e };
      delete n[key];
      return n;
    });
  }

  async function saveField(key: string, label: string) {
    const value = values[key] ?? "";
    if (value === (baseline[key] ?? "")) return;
    if (!window.confirm(`לשמור שינוי ב"${label}"?\n\n${SAVE_WARNING}`)) return;

    setSavingKeys((s) => new Set(s).add(key));
    try {
      await updateEmailContentAction({ data: { changes: { [key]: value } } });
      setBaseline((b) => ({ ...b, [key]: value }));
      setSavedKeys((s) => new Set(s).add(key));
      await router.invalidate();
    } catch (err) {
      console.error("[admin/emails] field save failed", key, err);
      setErrorByKey((e) => ({ ...e, [key]: "השמירה נכשלה. נסו שוב." }));
    } finally {
      setSavingKeys((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  const dirtyKeys = Object.keys(values).filter((k) => values[k] !== (baseline[k] ?? ""));

  async function onSaveAll() {
    if (!dirtyKeys.length) return;
    if (!window.confirm(`לשמור ${dirtyKeys.length} שינויים שטרם נשמרו?\n\n${SAVE_WARNING}`)) {
      return;
    }
    setSavingAll(true);
    try {
      const changes: Record<string, string> = {};
      for (const key of dirtyKeys) changes[key] = values[key];
      await updateEmailContentAction({ data: { changes } });
      setBaseline((b) => ({ ...b, ...changes }));
      setSavedKeys((s) => new Set([...s, ...dirtyKeys]));
      await router.invalidate();
    } catch (err) {
      console.error("[admin/emails] bulk save failed", err);
      window.alert("שמירת השינויים נכשלה. נסו שוב.");
    } finally {
      setSavingAll(false);
    }
  }

  const activePreview = previewKey ? previewByKey[previewKey] : null;

  // Patches the server-fetched preview HTML/subject with whatever's
  // currently typed (not yet saved) for the field(s) that feed this
  // preview, so the panel reflects edits as they happen instead of only
  // after a save + reload.
  const livePreview = useMemo(() => {
    if (!activePreview || !previewKey) return null;
    let html = activePreview.html;
    for (const key of fieldsForPreviewKey(previewKey)) {
      const oldVal = baseline[key] ?? "";
      const newVal = values[key] ?? "";
      if (!oldVal || oldVal === newVal) continue;
      html = html.split(escapeHtml(oldVal)).join(escapeHtml(newVal));
    }
    const subjectKey = previewKey.startsWith("welcome:")
      ? `welcome.${previewKey.slice("welcome:".length)}.subject`
      : null;
    const subject = subjectKey
      ? (values[subjectKey] ?? activePreview.subject)
      : activePreview.subject;
    return { ...activePreview, html, subject };
  }, [activePreview, previewKey, values, baseline]);

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
            שהוא נשלח בפועל. שמירת שדה מעדכנת מיד את התבנית בריסנד ותשפיע על כל המיילים שיישלחו
            ללקוחות מרגע השמירה והלאה.
          </p>

          {packages.map((pkg) => (
            <details key={pkg.id} className="glass-gold rounded-xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-gold">
                {pkg.label}
              </summary>
              <div className="space-y-4 mt-4">
                <Field
                  fieldKey={`welcome.${pkg.id}.subject`}
                  label="נושא מייל הברוכים הבאים"
                  value={values[`welcome.${pkg.id}.subject`] ?? ""}
                  dirty={dirtyKeys.includes(`welcome.${pkg.id}.subject`)}
                  saving={savingKeys.has(`welcome.${pkg.id}.subject`)}
                  saved={savedKeys.has(`welcome.${pkg.id}.subject`)}
                  error={errorByKey[`welcome.${pkg.id}.subject`]}
                  onChange={(v) => setField(`welcome.${pkg.id}.subject`, v)}
                  onSave={() => saveField(`welcome.${pkg.id}.subject`, "נושא מייל הברוכים הבאים")}
                  onPreview={() => setPreviewKey(`welcome:${pkg.id}`)}
                />
                {pkg.id === "core_single" ? (
                  <p className="text-xs text-muted-brown">
                    פתיח מייל הברוכים הבאים לוובינר בודד נקבע אוטומטית לפי השיעור שנרכש, ואינו ניתן
                    לעריכה כאן.
                  </p>
                ) : (
                  <Field
                    fieldKey={`welcome.${pkg.id}.intro`}
                    label="גוף מייל הברוכים הבאים (פתיח)"
                    value={values[`welcome.${pkg.id}.intro`] ?? ""}
                    dirty={dirtyKeys.includes(`welcome.${pkg.id}.intro`)}
                    saving={savingKeys.has(`welcome.${pkg.id}.intro`)}
                    saved={savedKeys.has(`welcome.${pkg.id}.intro`)}
                    error={errorByKey[`welcome.${pkg.id}.intro`]}
                    onChange={(v) => setField(`welcome.${pkg.id}.intro`, v)}
                    onSave={() => saveField(`welcome.${pkg.id}.intro`, "גוף מייל הברוכים הבאים")}
                    onPreview={() => setPreviewKey(`welcome:${pkg.id}`)}
                    multiline
                  />
                )}
                <Field
                  fieldKey={`reminder.${pkg.id}.verb`}
                  label="ניסוח תזכורת יום לפני"
                  value={values[`reminder.${pkg.id}.verb`] ?? ""}
                  dirty={dirtyKeys.includes(`reminder.${pkg.id}.verb`)}
                  saving={savingKeys.has(`reminder.${pkg.id}.verb`)}
                  saved={savedKeys.has(`reminder.${pkg.id}.verb`)}
                  error={errorByKey[`reminder.${pkg.id}.verb`]}
                  onChange={(v) => setField(`reminder.${pkg.id}.verb`, v)}
                  onSave={() => saveField(`reminder.${pkg.id}.verb`, "ניסוח תזכורת יום לפני")}
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
                fieldKey="coupon.intro"
                label="פתיח מייל קוד הנחה"
                value={values["coupon.intro"] ?? ""}
                dirty={dirtyKeys.includes("coupon.intro")}
                saving={savingKeys.has("coupon.intro")}
                saved={savedKeys.has("coupon.intro")}
                error={errorByKey["coupon.intro"]}
                onChange={(v) => setField("coupon.intro", v)}
                onSave={() => saveField("coupon.intro", "פתיח מייל קוד הנחה")}
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
                fieldKey="price_notice.intro"
                label="פתיח מייל התראת מחיר"
                value={values["price_notice.intro"] ?? ""}
                dirty={dirtyKeys.includes("price_notice.intro")}
                saving={savingKeys.has("price_notice.intro")}
                saved={savedKeys.has("price_notice.intro")}
                error={errorByKey["price_notice.intro"]}
                onChange={(v) => setField("price_notice.intro", v)}
                onSave={() => saveField("price_notice.intro", "פתיח מייל התראת מחיר")}
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
                fieldKey="payment_status.paid.title"
                label="כותרת — תשלום הצליח"
                value={values["payment_status.paid.title"] ?? ""}
                dirty={dirtyKeys.includes("payment_status.paid.title")}
                saving={savingKeys.has("payment_status.paid.title")}
                saved={savedKeys.has("payment_status.paid.title")}
                error={errorByKey["payment_status.paid.title"]}
                onChange={(v) => setField("payment_status.paid.title", v)}
                onSave={() => saveField("payment_status.paid.title", "כותרת — תשלום הצליח")}
                onPreview={() => setPreviewKey("payment_status_paid")}
              />
              <Field
                fieldKey="payment_status.paid.body"
                label="גוף — תשלום הצליח"
                value={values["payment_status.paid.body"] ?? ""}
                dirty={dirtyKeys.includes("payment_status.paid.body")}
                saving={savingKeys.has("payment_status.paid.body")}
                saved={savedKeys.has("payment_status.paid.body")}
                error={errorByKey["payment_status.paid.body"]}
                onChange={(v) => setField("payment_status.paid.body", v)}
                onSave={() => saveField("payment_status.paid.body", "גוף — תשלום הצליח")}
                onPreview={() => setPreviewKey("payment_status_paid")}
                multiline
              />
              <Field
                fieldKey="payment_status.failed.title"
                label="כותרת — תשלום נכשל"
                value={values["payment_status.failed.title"] ?? ""}
                dirty={dirtyKeys.includes("payment_status.failed.title")}
                saving={savingKeys.has("payment_status.failed.title")}
                saved={savedKeys.has("payment_status.failed.title")}
                error={errorByKey["payment_status.failed.title"]}
                onChange={(v) => setField("payment_status.failed.title", v)}
                onSave={() => saveField("payment_status.failed.title", "כותרת — תשלום נכשל")}
                onPreview={() => setPreviewKey("payment_status_failed")}
              />
              <Field
                fieldKey="payment_status.failed.body"
                label="גוף — תשלום נכשל"
                value={values["payment_status.failed.body"] ?? ""}
                dirty={dirtyKeys.includes("payment_status.failed.body")}
                saving={savingKeys.has("payment_status.failed.body")}
                saved={savedKeys.has("payment_status.failed.body")}
                error={errorByKey["payment_status.failed.body"]}
                onChange={(v) => setField("payment_status.failed.body", v)}
                onSave={() => saveField("payment_status.failed.body", "גוף — תשלום נכשל")}
                onPreview={() => setPreviewKey("payment_status_failed")}
                multiline
              />
            </div>
          </details>

          <div className="flex items-center gap-4 pt-2 sticky bottom-4 bg-ink/95 backdrop-blur border border-cream/15 rounded-xl px-5 py-4">
            <button
              type="button"
              onClick={onSaveAll}
              disabled={savingAll || !dirtyKeys.length}
              className="bg-gold text-ink px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
            >
              {savingAll
                ? "שומר..."
                : dirtyKeys.length
                  ? `שמירת ${dirtyKeys.length} שינויים`
                  : "אין שינויים לשמירה"}
            </button>
            <span className="text-muted-brown text-xs">{SAVE_WARNING}</span>
          </div>
        </div>

        <div className="lg:sticky lg:top-6 self-start">
          <div className="glass-gold rounded-xl p-4 h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-cream">תצוגה מקדימה</h2>
              {livePreview && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-brown">{livePreview.label}</span>
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
            {livePreview ? (
              <>
                <div className="text-xs text-muted-brown mb-2">נושא: {livePreview.subject}</div>
                <iframe
                  title="email-preview"
                  srcDoc={livePreview.html}
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
  dirty,
  saving,
  saved,
  error,
  onChange,
  onSave,
  onPreview,
  multiline,
  hint,
}: {
  fieldKey: string;
  label: string;
  value: string;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error?: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onPreview: () => void;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-muted-brown">{label}</span>
        <button type="button" onClick={onPreview} className="text-[11px] text-gold hover:underline">
          תצוגה מקדימה
        </button>
      </div>
      {multiline ? (
        <textarea
          dir="rtl"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream text-right focus:outline-none focus:border-gold resize-y"
        />
      ) : (
        <input
          dir="rtl"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream text-right focus:outline-none focus:border-gold"
        />
      )}
      <div className="flex items-center gap-3 mt-1.5">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="border border-gold/50 text-gold px-3 py-1 rounded-md text-[11px] font-semibold hover:bg-gold/10 transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          {saving ? "שומר..." : "שמירה"}
        </button>
        {hint && <span className="text-[11px] text-muted-brown">{hint}</span>}
        {!hint && saved && !dirty && !error && (
          <span className="text-green-400 text-[11px]">נשמר</span>
        )}
        {error && <span className="text-destructive text-[11px]">{error}</span>}
      </div>
      {hint && saved && !dirty && !error && (
        <span className="text-green-400 text-[11px] block mt-0.5">נשמר</span>
      )}
    </div>
  );
}
