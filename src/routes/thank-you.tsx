import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  ChevronDown,
  FileSearch,
  Scale,
  ShieldAlert,
  FileCheck,
  Banknote,
  ClipboardCheck,
  Home,
  DoorOpen,
  Gavel,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ibdaLogo from "@/assets/ibda-logo.png";
import { subscribeRegistration } from "@/lib/resend.functions";
import { createSumitPayment } from "@/lib/sumit.functions";
import { validateCoupon } from "@/lib/coupons.functions";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { buildPricingDateLabels } from "@/lib/pricing-dates";
import { isFreeCoreLesson } from "@/lib/core-lessons";
import {
  saveContact,
  loadContact,
  saveSelection,
  loadSelection,
  saveLessonSelection,
  loadLessonSelection,
  saveCouponCode,
  loadCouponCode,
  parsePriceIls,
} from "@/lib/checkout-client";

export const Route = createFileRoute("/thank-you")({
  head: () => ({
    meta: [
      { title: "תודה שנרשמת · IBDA" },
      { name: "description", content: "תודה שנרשמת לוובינר הפתוח של IBDA. הצצה לתוכניות ההמשך." },
    ],
  }),
  loader: async () => getScheduleData(),
  component: ThankYouPage,
});

const OPEN_WEBINAR_RECAP = {
  title: "כמה זה עולה לעשות עסקת נדל״ן?",
  dateLabel: "15.7 · 10:00",
};

const CORE_SERIES: { t: string; d: string; topics: string[]; icon: LucideIcon; date: string; free?: boolean }[] = [
  { t: "המפה המשפטית", d: "נסח הטאבו כמפת סיכונים", icon: FileSearch, date: "26.7 · 10:00", topics: ["הקריאה הנכונה של נסח היא ההבדל בין בדיקת נאותות לבין ניחוש. 90 דקות על כל מה שמסתתר בין השורות."] },
  { t: "דגשים בבדיקות מקדמיות", d: "עסקאות נוגדות", icon: Scale, date: "27.7 · 10:00", topics: ["סעיף 9 לחוק המקרקעין הוא זירת הקרב של תחרות הזכויות. איך מגינים על הלקוח ואיך תוקפים רישום מתחרה."] },
  { t: "לב העסקה - חלק א'", d: "התמודדות בניסוח סעיפים מגבילים", icon: ShieldAlert, date: "28.7 · 10:00", topics: ["מתן פתרון לניסוח סעיפים למחיקת הערות, עיקולים ומניעות רישום.", "מיפוי המניעות ומתן דרכי התמודדות."] },
  { t: "לב העסקה - חלק ב'", d: "הסכם מכר דירה יד שנייה: סעיפי הליבה", icon: FileCheck, date: "30.7 · 10:00", topics: ['כלל "ייזהר המוכר" ודרכי התמודדות.', 'כלל "ייזהר הקונה" ודרכי התמודדות.'] },
  { t: "המשכנתא", d: "מימון העסקה, בטוחות ומנגנוני תשלום בעסקת מכר", icon: Banknote, date: "3.8 · 10:00", topics: ["התמורה בגין העסקה למול חוות הדעת השמאית והמשמעות.", "בניית לוח התשלומים לרבות פיקדונות מסים – מדריך מעשי."] },
  { t: "מעמד החתימה ורישום הזכויות", d: "צ'ק ליסט מעשי למעמד חתימת העיסקה", icon: ClipboardCheck, date: "4.8 · 10:00", topics: ["המסמכים הנלווים", "חשיבות סיום העיסקה ברישום"] },
  { t: "הסכם השכירות", d: "בדיקת הצדדים להסכם וניסוח הסכם השכירות", icon: Home, date: "9.8 · 10:00", topics: ["מבדיקת השוכרים והבטוחות ועד לניסוח מותאם של סעיפי ההסכם.", "סעיפי ליבה בהשכרת דירה חדשה מקבלן ומשמעויות."] },
  { t: "פינוי מושכר", d: "הליך הפינוי בהבדל מהסעד הכספי", icon: DoorOpen, date: "11.8 · 10:00", free: true, topics: ["סדר הדין בתביעה לפינוי מושכר", "הליך הפינוי בהבדל מהסעד הכספי"] },
  { t: "העסקה שהשתבשה: ביטול, אכיפה וסעדים זמניים", d: "מה קורה במקרה של הפרה, מהי הפרה יסודית ודרכי ההתמודדות", icon: Gavel, date: "12.8 · 10:00", topics: ["אכיפת התחייבות למול ביטול ההסכם", "ההליכים המשפטיים שניתן לבצע"] },
];

const PRICING: {
  id: string; t: string; price?: string; early?: string; note: string; featured?: boolean; cta: string; duration?: string;
}[] = [
  { id: "core_full", t: "הסדרה המלאה · 9 מפגשים", price: "₪ 2,520", early: "₪ 1,620", duration: "9 מפגשים · 90 דקות למפגש", note: "מחיר מוקדם ל-72 שעות מסיום הוובינר הפתוח.", featured: true, cta: "רכישת הסדרה המלאה" },
  { id: "premium_litigation", t: "ליטיגציה בנדל״ן - סוגיות נבחרות", price: "₪ 480", early: "₪ 360", duration: "שעתיים", note: "סדנת פרימיום ממוקדת, מחיר מוקדם ל-72 שעות.", cta: "רכישת סדנת ליטיגציה" },
  { id: "premium_registration", t: "רישום בית משותף", price: "₪ 1,440", early: "₪ 1,080", duration: "4 שעות", note: "סדנת פרימיום ממוקדת, מחיר מוקדם ל-72 שעות.", cta: "רכישת רישום בית משותף" },
  { id: "premium_partnership", t: "סדנת שיתוף במקרקעין", price: "₪ 720", early: "₪ 540", duration: "שעתיים", note: "סדנת פרימיום ממוקדת, מחיר מוקדם ל-72 שעות.", cta: "רכישת סדנת שיתוף" },
  { id: "premium_ai", t: "AI ואוטומציות בעבודת עורך הדין", price: "₪ 480", early: "₪ 360", duration: "שעתיים", note: "סדנת פרימיום ממוקדת, מחיר מוקדם ל-72 שעות.", cta: "רכישת סדנת AI" },
  { id: "premium_bundle", t: "חבילת פרימיום הכל כלול", price: "₪ 3,720", early: "₪ 2,700", duration: "סדרה מלאה + 4 סדנאות", note: "סדרה מלאה בתוספת ארבע סדנאות הפרימיום. מחיר מוקדם ל-72 שעות.", featured: true, cta: "רכישת חבילת פרימיום" },
  { id: "core_single", t: "וובינר בודד מסדרת הליבה", price: "₪ 360", early: "₪ 180", duration: "90 דקות", note: "בחרו כמה שיעורים לרכוש — כל שיעור נחשב בנפרד.", cta: "רכישת וובינר בודד" },
];

const GROUP_DISCOUNTS = [
  { t: "רישום קבוצתי ממשרד אחד", d: "3 עד 4 משתתפים 15% הנחה. 5 משתתפים ומעלה 20% הנחה." },
  { t: "רישיון משרדי לסדרה המלאה", d: "עד 10 צופים ותוספת הקלטות לשימוש פנימי במשרד ₪ 6,900." },
  { t: "מתמחים וסטודנטים למשפטים", d: "40% הנחה בהצגת אישור, על וובינרים בודדים בלבד." },
  { t: "לשכות, ארגונים ומחלקות משפטיות", d: "הצעת מחיר פרטנית להרצאה סגורה החל מ-₪ 4,500 למפגש." },
];

const CANCELLATION_POLICY = [
  "ביטול עד 7 ימי עסקים לפני המפגש הראשון: החזר מלא.",
  "ביטול עד 48 שעות לפני: החזר של 50% או זיכוי מלא למועד אחר.",
  "פתיחת כל סדנא מותנית במינימום 15 נרשמים. במקרה של דחייה יינתן החזר מלא או זיכוי.",
];

const VALID_PACKAGE_IDS = new Set(PRICING.map((p) => p.id));
const PRICE_LOOKUP: Record<string, number> = Object.fromEntries(
  PRICING.map((p) => [p.id, parsePriceIls(p.early)]),
);

function sanitizeSelection(ids: Set<string>): Set<string> {
  return new Set(Array.from(ids).filter((id) => VALID_PACKAGE_IDS.has(id)));
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 justify-center mb-4">
      <span className="w-8 h-px bg-gold" />
      <span className="text-[11px] tracking-[0.28em] uppercase text-gold font-semibold ltr-inline">{children}</span>
      <span className="w-8 h-px bg-gold" />
    </div>
  );
}

function ThankYouPage() {
  const { openSession, coreSessions, premiumSessions, pricing } = Route.useLoaderData();
  const [selected, setSelected] = useState<Set<string>>(() =>
    sanitizeSelection(loadSelection("thank-you") ?? new Set()),
  );
  const [coreSingleLessons, setCoreSingleLessons] = useState<Set<number>>(
    () => loadLessonSelection("thank-you") ?? new Set(),
  );
  const [couponCode, setCouponCode] = useState(() => loadCouponCode());
  const [couponApplied, setCouponApplied] = useState<{
    code: string;
    discountPercent: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [registered] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("registered") === "1",
  );
  const formRef = useRef<HTMLDivElement>(null);

  const openWebinarRecap = {
    ...OPEN_WEBINAR_RECAP,
    dateLabel: (openSession && formatSessionDate(openSession.starts_at)) || OPEN_WEBINAR_RECAP.dateLabel,
  };
  const coreSeriesResolved = CORE_SERIES.map((s, i) => ({
    ...s,
    date: formatSessionDate(coreSessions[i]?.starts_at) || s.date,
  }));
  const pricingDateLabels = buildPricingDateLabels(coreSessions, premiumSessions);

  function currentPrice(id: string): number {
    return pricing[id]?.currentPrice ?? PRICE_LOOKUP[id] ?? 0;
  }

  // Lesson 8 ("פינוי מושכר") is free even when picked under the otherwise-
  // paid core_single package — don't count it toward the item count/total.
  const paidLessonCount = Array.from(coreSingleLessons).filter(
    (idx) => !isFreeCoreLesson(idx),
  ).length;
  const itemCount =
    Array.from(selected).filter((id) => id !== "core_single").length +
    (selected.has("core_single") ? paidLessonCount : 0);
  const baseTotal =
    Array.from(selected)
      .filter((id) => id !== "core_single")
      .reduce((sum, id) => sum + currentPrice(id), 0) +
    (selected.has("core_single") ? paidLessonCount * currentPrice("core_single") : 0);
  const discountPercent = couponApplied?.discountPercent ?? 0;
  const total = Math.round(baseTotal * (1 - discountPercent / 100));
  // Whether the current selection is actually chargeable — a core_single
  // selection made up entirely of free lessons (e.g. only lesson 8) charges
  // nothing, even though `selected` is non-empty.
  const hasPaid = total > 0;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      saveSelection("thank-you", n);
      return n;
    });
  }

  function toggleLesson(idx: number) {
    setCoreSingleLessons((s) => {
      const n = new Set(s);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      saveLessonSelection("thank-you", n);
      return n;
    });
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponChecking(true);
    setCouponError(null);
    try {
      const result = await validateCoupon({ data: { code: couponCode.trim() } });
      if (result.valid) {
        setCouponApplied({
          code: couponCode.trim().toUpperCase(),
          discountPercent: result.discount_percent,
        });
        saveCouponCode(couponCode.trim());
      } else {
        setCouponApplied(null);
        setCouponError("קוד ההנחה לא תקין או שכבר נוצל");
      }
    } catch (err) {
      console.error("[thank-you] coupon validation error", err);
      setCouponError("שגיאה בבדיקת הקוד, נסו שוב");
    } finally {
      setCouponChecking(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60">
        <div className="max-w-5xl mx-auto flex items-center justify-center px-6 py-5">
          <img src={ibdaLogo} alt="IBDA" className="h-10 w-auto" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-14">
        <section className="text-center mb-14 fade-rise">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border border-gold text-gold mb-5">
            {registered ? <Check size={26} strokeWidth={1.5} /> : <Calendar size={24} strokeWidth={1.5} />}
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl text-cream mb-4">
            {registered ? "תודה שנרשמת לוובינר הפתוח!" : "כל התוכניות והמחירים של IBDA"}
          </h1>
          {registered ? (
            <>
              <p className="text-cream text-[20px] font-medium leading-[1.85] max-w-xl mx-auto mb-5">
                {openWebinarRecap.title}
              </p>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-cream bg-gold/10 border border-gold/40 px-4 py-2 rounded-md">
                <Calendar size={16} className="text-gold" />
                <span>{openWebinarRecap.dateLabel}</span>
              </div>
            </>
          ) : (
            <p className="text-cream text-[20px] font-medium leading-[1.85] max-w-xl mx-auto mb-5">
              הצצה לכל תוכניות ההמשך של IBDA, כולל תמחור מוקדם ומועדים.
            </p>
          )}
        </section>

        <section className="mb-10">
          <div className="text-center mb-8">
            <SectionLabel>What's Next</SectionLabel>
            <h2 className="font-serif text-3xl md:text-4xl text-gold">
              {registered ? "בזמן שממתינים לוובינר, הכירו את ההמשך" : "בחרו את המסלול או הסדנה המתאימים לכם"}
            </h2>
            <p className="mt-4 text-muted-brown max-w-2xl mx-auto">
              מחיר ההרשמה המוקדמת בתוקף ל-72 שעות מסיום הוובינר הפתוח.
            </p>
          </div>

          <div className="grid gap-2.5">
            {PRICING.map((p) => {
              const isChecked = selected.has(p.id);
              const dateLabel = pricingDateLabels[p.id];
              const risen = pricing[p.id]?.risen ?? false;
              const priceNow = currentPrice(p.id);
              const priceRegular = pricing[p.id]?.regularPrice ?? parsePriceIls(p.price);
              return (
                <div key={p.id}>
                  <label
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-md border px-4 py-3 transition-colors cursor-pointer",
                      isChecked
                        ? "border-gold bg-gold/10"
                        : "border-cream/15 bg-ink/30 hover:border-gold/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-all",
                          isChecked ? "bg-gold border-gold text-ink" : "bg-cream border-cream",
                        )}
                      >
                        {isChecked && <Check size={13} strokeWidth={3} />}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isChecked}
                        onChange={() => toggle(p.id)}
                      />
                      <div className="flex flex-col">
                        <span className="text-[15px] font-medium text-cream">{p.t}</span>
                        {(p.duration || dateLabel) && (
                          <span className="text-[13px] tracking-[0.14em] uppercase mt-0.5 text-muted-brown">
                            {[p.duration, dateLabel].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {!risen && (
                        <span className="text-muted-brown ltr-inline text-[13px] line-through opacity-60">
                          ₪ {priceRegular.toLocaleString()}
                        </span>
                      )}
                      <span className="ltr-inline text-[14px] font-semibold text-gold">
                        ₪ {priceNow.toLocaleString()}
                      </span>
                    </div>
                  </label>

                  {p.id === "core_single" && isChecked && (
                    <div className="mt-2 mr-9 grid sm:grid-cols-2 gap-2">
                      {coreSeriesResolved.map((s, i) => {
                        const idx = i + 1;
                        const lessonChecked = coreSingleLessons.has(idx);
                        const lessonFree = isFreeCoreLesson(idx);
                        return (
                          <label
                            key={idx}
                            className={cn(
                              "flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] cursor-pointer transition-colors",
                              lessonChecked
                                ? "border-gold/60 bg-gold/5 text-cream"
                                : "border-cream/10 bg-ink/20 text-muted-brown hover:border-gold/30",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="accent-gold"
                              checked={lessonChecked}
                              onChange={() => toggleLesson(idx)}
                            />
                            <span className="truncate flex-1 min-w-0">
                              {idx}. {s.t} · {s.date}
                            </span>
                            {lessonFree && (
                              <span className="shrink-0 text-[10px] font-semibold tracking-[0.15em] uppercase px-1.5 py-0.5 rounded border border-gold/60 bg-gold/10 text-gold">
                                בחינם
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="mt-4 flex flex-col gap-4 rounded-md border border-gold/40 bg-gold/10 px-5 py-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    setCouponError(null);
                  }}
                  placeholder="קוד הנחה (אופציונלי)"
                  className="flex-1 bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-[14px] text-cream placeholder:text-muted-brown/60 focus:outline-none focus:border-gold ltr-inline"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponChecking || !couponCode.trim()}
                  className="shrink-0 border border-gold/50 text-gold px-4 py-2 rounded-md text-sm font-semibold hover:bg-gold/10 transition-colors disabled:opacity-50"
                >
                  {couponChecking ? "בודק..." : "החלת קוד"}
                </button>
              </div>
              {couponApplied && (
                <div className="text-[13px] text-green-400">
                  קוד {couponApplied.code} הופעל — הנחה של {couponApplied.discountPercent}%
                </div>
              )}
              {couponError && <div className="text-[13px] text-destructive">{couponError}</div>}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-right">
                  <div className="text-[13px] text-muted-brown">
                    {itemCount} {itemCount === 1 ? "פריט נבחר" : "פריטים נבחרו"}
                  </div>
                  <div className="text-xl font-serif text-gold ltr-inline">
                    סה"כ ₪{total.toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="shrink-0 bg-gold text-ink px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-gold-deep transition-colors"
                >
                  המשך להרשמה
                </button>
              </div>
            </div>
          )}
        </section>

        <CollapsiblePanel title="9 מפגשי סדרת הליבה בפירוט">
          <ul className="space-y-3">
            {coreSeriesResolved.map((s, i) => (
              <li key={s.t} className="flex items-start gap-3 bg-ink/40 border border-cream/10 rounded-md p-3">
                <span className="font-serif text-gold ltr-inline w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-cream text-[15px] font-medium">{s.t}</div>
                    {s.free && (
                      <span className="text-[10px] font-semibold tracking-[0.18em] uppercase px-2 py-0.5 rounded border border-gold bg-gold/10 text-gold">
                        בחינם!
                      </span>
                    )}
                  </div>
                  <div className="text-muted-brown text-[13px] mt-0.5">{s.d}</div>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gold">
                    <Calendar size={12} />
                    {s.date}
                  </div>
                  {s.topics.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {s.topics.map((topic) => (
                        <li key={topic} className="flex items-start gap-2 text-muted-brown text-[12.5px] leading-relaxed">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-gold/70 shrink-0" />
                          <span>{topic}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CollapsiblePanel>

        <CollapsiblePanel title="הנחות קבוצתיות ורישוי משרדי">
          <div className="grid sm:grid-cols-2 gap-4">
            {GROUP_DISCOUNTS.map((g) => (
              <div key={g.t} className="border border-cream/10 rounded-md p-4 bg-ink/30">
                <div className="text-cream font-serif text-base mb-1.5">{g.t}</div>
                <p className="text-muted-brown text-sm leading-relaxed">{g.d}</p>
              </div>
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="מדיניות הרשמה וביטולים">
          <ul className="space-y-2.5">
            {CANCELLATION_POLICY.map((line) => (
              <li key={line} className="flex items-start gap-3 text-muted-brown text-sm leading-relaxed">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CollapsiblePanel>

        <div ref={formRef} className="scroll-mt-10 mt-4">
          <RegistrationForm
            selected={selected}
            coreSingleLessons={coreSingleLessons}
            couponCode={couponApplied?.code}
            hasPaid={hasPaid}
          />
        </div>

        <div className="mt-10 text-center">
          <a href="mailto:webinar@ibda-law.com" className="text-sm text-muted-brown hover:text-gold transition-colors">
            שאלות? webinar@ibda-law.com
          </a>
        </div>
      </main>

      <footer className="py-8 border-t border-border">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs text-muted-brown">
          © {new Date().getFullYear()} משרד עו״ד יפעת בן דוד עמית. כל הזכויות שמורות.
        </div>
      </footer>
    </div>
  );
}

function CollapsiblePanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 bg-sand/70 border border-cream/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-right"
        aria-expanded={open}
      >
        <h3 className="font-serif text-lg text-gold">{title}</h3>
        <ChevronDown size={20} className={cn("text-gold transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-6 pb-6 border-t border-cream/10 pt-5">{children}</div>}
    </div>
  );
}

const RegSchema = z.object({
  first_name: z.string().trim().min(1, "יש להזין שם פרטי").max(100),
  last_name: z.string().trim().min(1, "יש להזין שם משפחה").max(100),
  email: z.string().trim().email("כתובת אימייל לא תקינה").max(255),
  phone: z.string().trim().min(6, "מספר טלפון קצר מדי").max(20),
  firm_name: z.string().trim().max(120).optional().or(z.literal("")),
  bar_license: z.string().trim().max(20).optional().or(z.literal("")),
  id_number: z.string().trim().max(20).optional().or(z.literal("")),
});

function RegistrationForm({
  selected,
  coreSingleLessons,
  couponCode,
  hasPaid,
}: {
  selected: Set<string>;
  coreSingleLessons: Set<number>;
  couponCode?: string;
  hasPaid: boolean;
}) {
  const savedContact = useRef(loadContact()).current;
  const [first_name, setFirstName] = useState(savedContact?.first_name ?? "");
  const [last_name, setLastName] = useState(savedContact?.last_name ?? "");
  const [email, setEmail] = useState(savedContact?.email ?? "");
  const [phone, setPhone] = useState(savedContact?.phone ?? "");
  const [firm_name, setFirmName] = useState(savedContact?.firm_name ?? "");
  const [bar_license, setBarLicense] = useState(savedContact?.bar_license ?? "");
  const [id_number, setIdNumber] = useState(savedContact?.id_number ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Whether an invoice (and so an ID/company number) is needed — distinct
  // from "a package is selected", since a core_single selection made up
  // entirely of free lessons (e.g. only lesson 8) charges nothing.
  const requiresIdNumber = hasPaid;

  useEffect(() => {
    saveContact({ first_name, last_name, email, phone, firm_name, bar_license, id_number });
  }, [first_name, last_name, email, phone, firm_name, bar_license, id_number]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const parsed = RegSchema.safeParse({ first_name, last_name, email, phone, firm_name, bar_license, id_number });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (errs[i.path.join(".")] = i.message));
      setErrors(errs);
      toast.error("יש לתקן את השדות המסומנים");
      return;
    }
    if (requiresIdNumber && (parsed.data.id_number || "").trim().length < 5) {
      setErrors({ id_number: "מספר ת.ז / ח.פ הכרחי לצורך הפקת חשבונית" });
      toast.error("יש להזין מספר ת.ז או ח.פ תקין");
      return;
    }
    if (selected.size === 0) {
      toast.error("יש לבחור מסלול או חבילה למעלה לפני ההרשמה");
      return;
    }
    if (selected.has("core_single") && coreSingleLessons.size === 0) {
      toast.error("יש לבחור לפחות שיעור אחד מסדרת הליבה");
      return;
    }
    setErrors({});
    setSubmitting(true);

    const lessonIndexes = Array.from(coreSingleLessons);
    try {
      await subscribeRegistration({
        data: {
          first_name: parsed.data.first_name,
          last_name: parsed.data.last_name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          firm_name: parsed.data.firm_name || "",
          bar_license: parsed.data.bar_license || "",
          selected_packages: Array.from(selected),
          core_single_lesson_indexes: selected.has("core_single") ? lessonIndexes : undefined,
        },
      });
    } catch (err) {
      console.error("[thank-you] subscribe error", err);
      setSubmitting(false);
      setServerError("אירעה תקלה בשליחת ההרשמה. אנא נסו שוב בעוד רגע.");
      return;
    }

    if (hasPaid) {
      try {
        const orderRef = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { payment_url } = await createSumitPayment({
          data: {
            package_ids: Array.from(selected),
            email: parsed.data.email,
            full_name: `${parsed.data.first_name} ${parsed.data.last_name}`.trim(),
            phone: parsed.data.phone,
            order_reference: orderRef,
            id_number: parsed.data.id_number || "",
            core_single_lesson_indexes: selected.has("core_single") ? lessonIndexes : undefined,
            coupon_code: couponCode,
          },
        });
        if (typeof window !== "undefined" && payment_url) {
          window.location.href = payment_url;
          return;
        }
      } catch (err) {
        console.error("[thank-you] Sumit payment error", err);
        setSubmitting(false);
        setServerError("אירעה תקלה ביצירת דף התשלום. אנא נסו שוב או פנו אלינו.");
        return;
      }
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} className="glass-gold rounded-2xl p-6 md:p-8 fade-rise">
      <h3 className="font-serif text-2xl text-cream text-center mb-6">השלמת הרכישה</h3>
      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <RegField label="שם פרטי" required value={first_name} onChange={setFirstName} error={errors.first_name} />
        <RegField label="שם משפחה" required value={last_name} onChange={setLastName} error={errors.last_name} />
        <RegField label="אימייל" type="email" required value={email} onChange={setEmail} error={errors.email} dir="ltr" />
        <RegField label="טלפון נייד" type="tel" required value={phone} onChange={setPhone} error={errors.phone} dir="ltr" />
        <RegField label="שם המשרד או חברה" value={firm_name} onChange={setFirmName} />
        <RegField label="מספר רישיון עריכת דין" value={bar_license} onChange={setBarLicense} dir="ltr" />
        {requiresIdNumber && (
          <RegField
            label="ת.ז / ח.פ (לצורך הפקת חשבונית)"
            required
            value={id_number}
            onChange={setIdNumber}
            error={errors.id_number}
            dir="ltr"
          />
        )}
      </fieldset>

      {serverError && (
        <div className="mt-5 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded p-3">
          {serverError}
        </div>
      )}

      <div className="mt-7 flex justify-center">
        <button
          type="submit"
          disabled={submitting}
          className="btn-shimmer w-full max-w-md bg-gold text-ink py-4 rounded-md text-[15px] font-semibold hover:bg-gold-deep transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5"
        >
          <span className="relative z-10">
            {submitting ? "מעבד..." : hasPaid ? "המשך לתשלום" : "השלמת הרשמה"}
          </span>
        </button>
      </div>
    </form>
  );
}

function RegField({
  label, value, onChange, type = "text", required, error, dir,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; error?: string; dir?: "ltr" | "rtl" }) {
  return (
    <label className="block">
      <span className="text-[14px] font-semibold text-cream mb-2 block">
        {label} {required && <span className="text-gold">*</span>}
      </span>
      <input
        type={type}
        dir={dir}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-[15px] text-cream placeholder:text-muted-brown/60 focus:outline-none focus:border-gold focus:bg-ink/60 transition-colors",
          error && "border-destructive",
        )}
      />
      {error && <span className="text-xs text-destructive mt-1 block">{error}</span>}
    </label>
  );
}
