import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronDown, Check, Calendar, CalendarDays, Sparkles, MessageCircle, Map, SearchCheck, FileText, FileSignature, Landmark, Receipt, Building2, Handshake, HardHat, MonitorPlay, BookOpen, FileSearch, Scale, ShieldAlert, FileCheck, Banknote, ClipboardCheck, Home, DoorOpen, Gavel, BrainCircuit, Mail, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import ibdaLogo from "@/assets/ibda-logo.png";
import yifatPhoto from "@/assets/yifat.jpg";
import {
  RegistrationModalContext,
  useRegistrationModal,
} from "@/lib/registration-modal-context";
import { subscribeRegistration } from "@/lib/resend.functions";
import { createSumitPayment } from "@/lib/sumit.functions";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";


function AnimatedCardIcon({
  Icon,
  className,
  size,
  strokeWidth,
}: {
  Icon: LucideIcon;
  className?: string;
  size: number;
  strokeWidth: number;
}) {
  const iconRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = iconRef.current;
    if (!svg) return;

    const segments = Array.from(
      svg.querySelectorAll<SVGGeometryElement>("path, line, circle, rect, polyline, polygon, ellipse"),
    );

    // Shared global epoch so every icon on the page is phase-aligned
    // and completes its drawing at the exact same moment.
    const w = window as unknown as { __iconDrawEpoch?: number };
    if (!w.__iconDrawEpoch) w.__iconDrawEpoch = performance.now();
    const epoch = w.__iconDrawEpoch;
    const CYCLE_MS = 5800;
    const offset = ((performance.now() - epoch) % CYCLE_MS);

    segments.forEach((segment) => {
      const length = Math.max(segment.getTotalLength(), 1);
      segment.style.setProperty("--icon-path-length", `${length}`);
      segment.style.strokeDasharray = `${length}`;
      segment.style.strokeDashoffset = `${length}`;
      // Negative delay aligns all icons to the same shared timeline.
      segment.style.animationDelay = `-${offset}ms`;
    });

    svg.classList.add("is-draw-ready");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      segments.forEach((segment) => {
        segment.style.strokeDashoffset = "0";
      });
      svg.classList.add("is-drawn");
      return;
    }

    svg.classList.add("is-drawn");
  }, [Icon]);


  return (
    <Icon
      ref={iconRef}
      size={size}
      className={cn("card-icon-bg", className)}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  );
}




export const Route = createFileRoute("/")({
  loader: async () => getScheduleData(),
  component: Landing,
});



/* -------------------------- content -------------------------- */

const openWebinars = [
  {
    n: "01",
    title: "כמה זה עולה לעשות עסקת נדל״ן?",
    desc: "השיחה המקדימה עם הלקוח, הגדרת השירות, קביעת שכר טרחה וניהול סיכונים לאורך העסקה.",
    dateLabel: "15.7 · 10:00",
    dateISO: "2026-07-15T10:00:00+03:00",
    topics: [
      "השיחה המקדימה עם הלקוח: מה שואלים, איך מקשיבים, היכן בודקים",
      "הגדרת היקף השירות: מה כולל ומה לא כולל בשירות",
      "קביעת שכר טרחה: זמן, מורכבות, שווי הממכר, שיטות מקובלות, ועיגונים בפסיקה לשכר ראוי",
      "עריכת הסכם שכר טרחה: מבנה, סעיפים חיוניים, מנגנוני תשלום",
      "\n",
      "הדגמה live",
    ],
  },
];



const coreSeries: { t: string; d: string; topics: string[]; icon: LucideIcon; date: string }[] = [
  {
    t: "המפה המשפטית",
    d: "נסח הטאבו כמפת סיכונים",
    icon: FileSearch,
    date: "26.7 · 10:00",
    topics: [
      "הקריאה הנכונה של נסח היא ההבדל בין בדיקת נאותות לבין ניחוש. 90 דקות על כל מה שמסתתר בין השורות.",
    ],
  },
  {
    t: "דגשים בבדיקות מקדמיות ",
    d: "עסקאות נוגדות",
    icon: Scale,
    date: "27.7 · 10:00",
    topics: [
      "סעיף 9 לחוק המקרקעין הוא זירת הקרב של תחרות הזכויות. איך מגינים על הלקוח ואיך תוקפים רישום מתחרה.",
    ],
  },
  {
    t: "לב העסקה - חלק א'",
    d: "התמודדות בניסוח סעיפים מגבילים",
    icon: ShieldAlert,
    date: "28.7 · 10:00",
    topics: [
      "מתן פתרון לניסוח סעיפים למחיקת הערות, עיקולים ומניעות רישום.",
      "מיפוי המניעות ומתן דרכי התמודדות.",
    ],
  },
  {
    t: "לב העסקה - חלק ב'",
    d: "הסכם מכר דירה יד שנייה: סעיפי הליבה",
    icon: FileCheck,
    date: "30.7 · 10:00",
    topics: [
      'כלל "ייזהר המוכר" ודרכי התמודדות.',
      'כלל "ייזהר הקונה" ודרכי התמודדות.',
    ],
  },
  {
    t: "המשכנתא",
    d: "מימון העסקה, בטוחות ומנגנוני תשלום בעסקת מכר",
    icon: Banknote,
    date: "3.8 · 10:00",
    topics: [
      "התמורה בגין העסקה למול חוות הדעת השמאית והמשמעות.",
      "בניית לוח התשלומים לרבות פיקדונות מסים – מדריך מעשי.",
    ],
  },
  {
    t: "מעמד החתימה ורישום הזכויות",
    d: "צ'ק ליסט מעשי למעמד חתימת העיסקה",
    icon: ClipboardCheck,
    date: "4.8 · 10:00",
    topics: [
      "המסמכים הנלווים",
      "חשיבות סיום העיסקה ברישום",
    ],
  },
  {
    t: "הסכם השכירות",
    d: "בדיקת הצדדים להסכם וניסוח הסכם השכירות",
    icon: Home,
    date: "9.8 · 10:00",
    topics: [
      "מבדיקת השוכרים והבטוחות ועד לניסוח מותאם של סעיפי ההסכם.",
      "סעיפי ליבה בהשכרת דירה חדשה מקבלן ומשמעויות.",
    ],
  },
  {
    t: "פינוי מושכר",
    d: "הליך הפינוי בהבדל מהסעד הכספי",
    icon: DoorOpen,
    date: "11.8 · 10:00",
    topics: [
      "סדר הדין בתביעה לפינוי מושכר",
      "הליך הפינוי בהבדל מהסעד הכספי\u00A0",
    ],
  },
  {
    t: "העסקה שהשתבשה: ביטול, אכיפה וסעדים זמניים",
    d: "מה קורה במקרה של הפרה, מהי הפרה יסודית ודרכי ההתמודדות",
    icon: Gavel,
    date: "12.8 · 10:00",
    topics: [
      "אכיפת התחייבות למול ביטול ההסכם",
      "ההליכים המשפטיים שניתן לבצע",
    ],
  },
];

// Matches premiumWorkshops' array order — used to look up each workshop's
// dynamic date from the loaded sessions by key.
const PREMIUM_WORKSHOP_IDS = ["premium_litigation", "premium_registration", "premium_partnership", "premium_ai"];

const premiumWorkshops: { t: string; meta: string; d: string; date: string; topics: string[] }[] = [
  {
    t: "ליטיגציה בנדל״ן - סוגיות נבחרות",
    meta: "שעתיים",
    date: "16.8 · 10:00",
    d: "כשעסקאות משתבשות: ניהול סכסוכים, ביטול ואכיפת הסכמים.",
    topics: [
      "ההליך המשפטי: עילות ביטול (טעות, הטעיה, אי התאמה), הפרות ופיצויים מוסכמים",
      "סעדים ואכיפה: סעדים זמניים, עסקאות נוגדות ואכיפת הסכם מכר",
      "הליכים מיוחדים: תביעות נגד קבלנים, חריגות בבית משותף ופירוק שיתוף בירושה",
      "תרגול מעשי: כתיבת כתב תביעה, בקשה לסעד זמני וניתוח תיקים באמצעות בינה מלאכותית",
    ],
  },
  {
    t: "רישום בית משותף",
    meta: "4 שעות",
    date: "13.8 · 09:00",
    d: "ניהול ההליך השלם לרישום והסדרת זכויות בבתים משותפים.",
    topics: [
      "צו רישום: תנאי סף, הכנה, אישור ותיקון",
      "תקנון והצמדות: הסדרת רכוש משותף, מה ניתן ומה לא ניתן להצמיד",
      "התנהלות מוסדית: תשריט מודד, עבודה מול לשכת הרישום והמפקח, והכשרת מבנים ללא היתר",
      "תרגול מעשי: ניתוח צו רישום אמיתי, ניסוח תקנון מוסכם ל 4 יחידות והכנת בקשה לתיקון",
    ],
  },
  {
    t: "שיתוף במקרקעין",
    meta: "שעתיים",
    date: "17.8 · 10:00",
    d: "הסדרת זכויות במקרקעין מורכבים ובלתי רשומים.",
    topics: [
      "הסכמי שיתוף: מבנה נכון, הליכי רישום וההשלכות של אי רישום",
      "זכויות מורכבות: פרצלציה, קרקעות מנהל לא מוסדרות וזכויות חכירה",
      "התיישנות: ביסוס זכויות מכוח שימוש והסדרתן",
      "תרגול מעשי: ניסוח הסכם שיתוף מלא וכתיבת חוות דעת משפטית ללקוח",
    ],
  },
  {
    t: "העתיד כבר כאן! AI ואוטומציות בעבודת עורך הדין",
    meta: "שעתיים",
    date: "21.7 · 10:00",
    d: "וובינר ייחודי שמכניס את עורך הדין לעולם הטכנולוגיה המשפטית.",
    topics: [
      "מבוא לבינה מלאכותית למשפטנים",
      "כלי AI לכתיבה משפטית",
      "בדיקת מסמכים באמצעות AI",
      "אתיקה ו-AI",
      "מתרגלים live",
    ],
  },
];

const pricing: {
  id: string;
  t: string;
  price?: string;
  early?: string;
  free?: boolean;
  note: string;
  featured?: boolean;
  cta: string;
  duration?: string;
  comingSoon?: boolean;
}[] = [
  { id: "open", t: "וובינר פתוח", free: true, note: "מפגש היכרות ללא תשלום, כולל מקבץ שאלות ותשובות.", cta: "להרשמה חינם" },
  { id: "core_full", t: "הסדרה המלאה · 9 מפגשים", price: "₪ 2,520", early: "₪ 1,620", duration: "9 מפגשים · 90 דקות למפגש", note: "מחיר מוקדם ל 72 שעות מסיום הוובינר הפתוח.", featured: true, cta: "רכישת הסדרה המלאה" },
  { id: "premium_litigation", t: "ליטיגציה בנדל״ן - סוגיות נבחרות", price: "₪ 480", early: "₪ 360", duration: "שעתיים", note: "סדנת פרימיום ממוקדת, מחיר מוקדם ל 72 שעות.", cta: "רכישת סדנת ליטיגציה" },
  { id: "premium_registration", t: "רישום בית משותף", price: "₪ 1,440", early: "₪ 1,080", duration: "4 שעות", note: "סדנת פרימיום ממוקדת, מחיר מוקדם ל 72 שעות.", cta: "רכישת רישום בית משותף" },
  { id: "premium_partnership", t: "סדנת שיתוף במקרקעין", price: "₪ 720", early: "₪ 540", duration: "שעתיים", note: "סדנת פרימיום ממוקדת, מחיר מוקדם ל 72 שעות.", cta: "רכישת סדנת שיתוף" },
  { id: "premium_ai", t: "AI ואוטומציות בעבודת עורך הדין", price: "₪ 480", early: "₪ 360", duration: "שעתיים", note: "סדנת פרימיום ממוקדת, מחיר מוקדם ל 72 שעות.", cta: "רכישת סדנת AI" },
  { id: "premium_bundle", t: "חבילת פרימיום הכל כלול", price: "₪ 3,720", early: "₪ 2,700", duration: "סדרה מלאה + 4 סדנאות", note: "סדרה מלאה בתוספת ארבע סדנאות הפרימיום. מחיר מוקדם ל 72 שעות.", featured: true, cta: "רכישת חבילת פרימיום" },
  { id: "core_single", t: "וובינר בודד מסדרת הליבה", price: "₪ 360", early: "₪ 180", duration: "90 דקות", note: "מחיר מוקדם ל 72 שעות מסיום הוובינר הפתוח.", cta: "רכישת וובינר בודד", comingSoon: true },
];

// External purchase URLs on ibda-law.com — checkout runs on that site.
// Update each entry with the exact product URL once available.
const PURCHASE_URLS: Record<string, string> = {
  core_single: "https://ibda-law.com",
  core_full: "https://ibda-law.com",
  premium_litigation: "https://ibda-law.com",
  premium_registration: "https://ibda-law.com",
  premium_partnership: "https://ibda-law.com",
  premium_ai: "https://ibda-law.com",
  premium_bundle: "https://ibda-law.com",
};


function handleTicketAction(
  id: string,
  openModal: (packageId?: string, coreLessonTitle?: string) => void,
  coreLessonTitle?: string,
) {
  openModal(id, coreLessonTitle);
}





const includedItems = [
  "השתתפות חיה בזום כולל מקבץ שאלות ותשובות",
  "גישה להקלטה למשך 30 יום (בחבילת הפרימיום 90 יום)",
  "מצגת, צ׳קליסטים וטמפלייטים להורדה",
];

const groupDiscounts = [
  { t: "רישום קבוצתי ממשרד אחד", d: "3 עד 4 משתתפים 15% הנחה. 5 משתתפים ומעלה 20% הנחה." },
  { t: "רישיון משרדי לסדרה המלאה", d: "עד 10 צופים ותוספת הקלטות לשימוש פנימי במשרד. ₪ 6,900." },
  { t: "מתמחים וסטודנטים למשפטים", d: "40% הנחה בהצגת אישור, על וובינרים בודדים בלבד." },
  { t: "לשכות, ארגונים ומחלקות משפטיות", d: "הצעת מחיר פרטנית להרצאה סגורה החל מ ₪ 4,500 למפגש." },
];

const cancellationPolicy = [
  "ביטול עד 7 ימי עסקים לפני המפגש הראשון: החזר מלא.",
  "ביטול עד 48 שעות לפני: החזר של 50% או זיכוי מלא למועד אחר.",
  "לאחר מכן: זיכוי לצפייה בהקלטה בלבד.",
  "פתיחת כל סדנא מותנית במינימום 15 נרשמים. במקרה של דחייה יינתן החזר מלא או זיכוי.",
];


/* -------------------------- schema -------------------------- */


/* -------------------------- page -------------------------- */

function Landing() {
  const { openSession, coreSessions, premiumSessions } = Route.useLoaderData();
  const [selected, setSelected] = useState<Set<string>>(new Set(["open"]));
  const [coreLesson, setCoreLesson] = useState<string>("");

  const openWebinarsResolved = openWebinars.map((w) => ({
    ...w,
    dateLabel: (openSession && formatSessionDate(openSession.starts_at)) || w.dateLabel,
    dateISO: openSession?.starts_at || w.dateISO,
  }));
  const coreSeriesResolved = coreSeries.map((s, i) => ({
    ...s,
    date: formatSessionDate(coreSessions[i]?.starts_at) || s.date,
  }));
  const premiumWorkshopsResolved = premiumWorkshops.map((w, i) => {
    const session = premiumSessions.find((p) => p.key === PREMIUM_WORKSHOP_IDS[i]);
    return { ...w, date: formatSessionDate(session?.starts_at) || w.date };
  });

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const open = useCallback((packageId?: string, coreLessonTitle?: string) => {
    if (coreLessonTitle) {
      setCoreLesson(coreLessonTitle);
    }
    if (packageId) {
      const isComingSoon = pricing.find((p) => p.id === packageId)?.comingSoon;
      if (isComingSoon) return;
      setSelected((s) => {
        if (s.has(packageId)) return s;
        const n = new Set(s);
        n.add(packageId);
        return n;
      });
    }
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        document.getElementById("register")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  return (
    <RegistrationModalContext.Provider value={{ open, selected, toggle, coreLesson }}>
      <div className="min-h-screen bg-ink text-cream font-sans">
        <AnnouncementBar dateISO={openWebinarsResolved[0].dateISO} />
        <TopBar />
        <Hero />
        <ModelSection />
        <OpenWebinarsSection data={openWebinarsResolved} />
        <CoreSeriesSection data={coreSeriesResolved} />
        <PremiumSection data={premiumWorkshopsResolved} />
        <PricingSection />
        <RegistrationSection />
        <Footer />
      </div>
    </RegistrationModalContext.Provider>
  );
}


/* -------------------------- top bar -------------------------- */

function TopBar() {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-40 backdrop-blur-md bg-[color-mix(in_oklab,var(--ink)_88%,transparent)] border-b border-border/60">
        <div className="max-w-6xl mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-6 py-2 sm:py-4">
          <a href="#top" className="flex items-center gap-3 justify-self-start shrink-0">
            <img src={ibdaLogo} alt="IBDA" className="h-9 sm:h-14 w-auto" />
            <span className="hidden sm:block text-xs tracking-[0.22em] text-muted-brown ltr-inline uppercase">
              IBDA · Law Firm
            </span>
          </a>
          <a
            href="mailto:webinar@ibda-law.com"
            className="hidden md:inline-flex items-center justify-center gap-2 text-sm text-paper hover:text-gold transition-colors min-w-0 truncate"
          >
            <Mail size={16} className="shrink-0" />
            <span className="truncate">webinar@ibda-law.com</span>
          </a>
          <span className="md:hidden" />
          <div className="flex items-center gap-1.5 sm:gap-3 justify-self-end shrink-0">
            <ScheduleButton onClick={() => setScheduleOpen(true)} />
            <a
              href="#register"
              className="group inline-flex text-xs sm:text-sm font-semibold text-ink bg-gold border border-gold px-2.5 sm:px-5 py-1.5 sm:py-2.5 rounded-md btn-pulse-glow btn-shimmer hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-300 whitespace-nowrap"
            >
              <span className="relative z-10 inline-flex items-center gap-1.5 sm:gap-2">
                <MonitorPlay size={15} className="sm:hidden" />
                <MonitorPlay size={17} className="hidden sm:block" />
                <span className="hidden xs:inline sm:hidden">הרשמה</span>
                <span className="hidden sm:inline">הרשמה לוובינרים</span>
                <span className="xs:hidden sm:hidden">הרשמה</span>
              </span>
            </a>
          </div>
        </div>
      </div>
      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />
    </>
  );
}

/* -------------------------- announcement bar -------------------------- */

type ScheduleItem = {
  kind: "וובינר פתוח" | "סדרת הליבה" | "סדנה";
  title: string;
  date: string;
  sortKey: string; // ISO-ish for sorting
};

const scheduleItems: ScheduleItem[] = ([
  { kind: "וובינר פתוח", title: "כמה זה עולה לעשות עסקת נדל״ן?", date: "15.7 · 10:00", sortKey: "2026-07-15T10:00" },
  { kind: "סדנה", title: "העתיד כבר כאן! AI ואוטומציות בעבודת עורך הדין", date: "21.7 · 10:00", sortKey: "2026-07-21T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 1 · המפה המשפטית", date: "26.7 · 10:00", sortKey: "2026-07-26T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 2 · דגשים בבדיקות מקדמיות", date: "27.7 · 10:00", sortKey: "2026-07-27T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 3 · לב העסקה — חלק א׳", date: "28.7 · 10:00", sortKey: "2026-07-28T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 4 · לב העסקה — חלק ב׳", date: "30.7 · 10:00", sortKey: "2026-07-30T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 5 · המשכנתא", date: "3.8 · 10:00", sortKey: "2026-08-03T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 6 · מעמד החתימה ורישום הזכויות", date: "4.8 · 10:00", sortKey: "2026-08-04T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 7 · הסכם השכירות", date: "9.8 · 10:00", sortKey: "2026-08-09T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 8 · פינוי מושכר", date: "11.8 · 10:00", sortKey: "2026-08-11T10:00" },
  { kind: "סדרת הליבה", title: "מפגש 9 · העסקה שהשתבשה: ביטול, אכיפה וסעדים זמניים", date: "12.8 · 10:00", sortKey: "2026-08-12T10:00" },
  { kind: "סדנה", title: "רישום בית משותף (סדנה יומית · 4 שעות)", date: "13.8 · 09:00", sortKey: "2026-08-13T09:00" },
  { kind: "סדנה", title: "ליטיגציה בנדל״ן — סוגיות נבחרות", date: "16.8 · 10:00", sortKey: "2026-08-16T10:00" },
  { kind: "סדנה", title: "שיתוף במקרקעין", date: "17.8 · 10:00", sortKey: "2026-08-17T10:00" },
] as ScheduleItem[]).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

function ScheduleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nextIdx = (() => {
    const now = Date.now();
    const i = scheduleItems.findIndex((it) => new Date(it.sortKey + ":00+03:00").getTime() > now);
    return i === -1 ? -1 : i;
  })();

  const kindStyles: Record<ScheduleItem["kind"], string> = {
    "וובינר פתוח": "bg-gold text-ink",
    "סדרת הליבה": "bg-gold/15 text-gold border border-gold/40",
    "סדנה": "bg-cream/10 text-cream border border-cream/25",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl bg-ink border border-gold/30 text-cream max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader className="text-center">
          <DialogTitle className="font-serif text-2xl md:text-3xl text-gold flex items-center justify-center gap-3">
            <CalendarDays size={26} className="text-gold" />
            לו״ז המפגשים
          </DialogTitle>
          <DialogDescription className="text-center text-muted-brown text-[14px] leading-relaxed">
            כל המפגשים לפי סדר כרונולוגי
          </DialogDescription>
        </DialogHeader>

        <ol className="mt-4 space-y-2">
          {scheduleItems.map((it, i) => {
            const isNext = i === nextIdx;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                  isNext
                    ? "border-gold/60 bg-gold/10 shadow-[0_0_20px_-8px_rgba(196,164,97,0.5)]"
                    : "border-cream/10 bg-sand/40",
                )}
              >
                <span className="font-serif text-lg text-gold ltr-inline w-7 shrink-0 pt-0.5 text-left">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className={cn("inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded", kindStyles[it.kind])}>
                      {it.kind}
                    </span>
                    {isNext && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink bg-gold px-2 py-0.5 rounded">
                        <Sparkles size={11} />
                        המפגש הקרוב
                      </span>
                    )}
                  </div>
                  <p className="text-cream text-[15px] leading-snug font-medium">{it.title}</p>
                  <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-cream bg-gold/10 border border-gold/40 px-2.5 py-1 rounded-md">
                    <Calendar size={13} className="text-gold" />
                    <span>{it.date}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center min-w-[2.4rem] sm:min-w-[3rem]">
      <span className="text-xl sm:text-3xl font-bold text-cream tabular-nums leading-none">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] sm:text-xs text-muted-brown mt-1">{label}</span>
    </div>
  );
}

function ScheduleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex text-xs sm:text-sm font-semibold text-ink bg-gold border border-gold px-2.5 sm:px-5 py-1.5 sm:py-2.5 rounded-md btn-pulse-glow btn-shimmer hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-300 whitespace-nowrap"
    >
      <span className="relative z-10 inline-flex items-center gap-1.5 sm:gap-2">
        <CalendarDays size={15} className="sm:hidden text-ink/80 group-hover:text-ink transition-colors" />
        <CalendarDays size={17} className="hidden sm:block text-ink/80 group-hover:text-ink transition-colors" />
        <span className="hidden sm:inline">לו״ז מפגשים</span>
        <span className="sm:hidden">לו״ז</span>
      </span>
    </button>
  );
}

function AnnouncementBar({ dateISO }: { dateISO: string }) {
  const target = new Date(dateISO);
  const compute = () => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      expired: false,
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  };
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState({ expired: false, days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    setHydrated(true);
    const tick = () => setState(compute());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hydrated) {
    return <div className="bg-sand/60 backdrop-blur-xl border-b border-gold/20 py-3 px-4" aria-hidden />;
  }

  if (state.expired) {
    return (
      <div className="bg-gold/10 border-b border-gold/30 py-3 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3">
          <p className="text-sm sm:text-base text-cream font-medium text-center">
            הוובינר החל! נתראה במפגש הבא
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-sand/60 backdrop-blur-xl border-b border-gold/20 py-3 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <p className="text-sm sm:text-base text-cream font-medium text-center">
          הירשמו עכשיו! הוובינר הפתוח יוצא לדרך בעוד:
        </p>
        <div className="flex items-center gap-1 sm:gap-2" dir="ltr">
          <TimeUnit value={state.days} label="ימים" />
          <span className="text-cream/40 text-xl sm:text-3xl font-light leading-none">:</span>
          <TimeUnit value={state.hours} label="שעות" />
          <span className="text-cream/40 text-xl sm:text-3xl font-light leading-none">:</span>
          <TimeUnit value={state.minutes} label="דקות" />
          <span className="text-cream/40 text-xl sm:text-3xl font-light leading-none">:</span>
          <TimeUnit value={state.seconds} label="שניות" />
        </div>
      </div>
    </div>
  );
}


function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 pt-12 md:pt-20 pb-12 md:pb-20 grid md:grid-cols-[1.15fr_1fr] gap-10 md:gap-14 items-center">
        <div className="fade-rise">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-10 h-px bg-gold" />
            <span className="text-[11px] tracking-[0.28em] uppercase text-gold font-semibold ltr-inline">
              Deal Flow · 2026
            </span>
          </div>

          <h1 className="font-serif text-6xl sm:text-7xl md:text-8xl font-light leading-[1.1] tracking-tight text-shimmer">
            עסקאות נדל״ן
            <br />
            <span className="font-medium">וליטיגציה</span>.
          </h1>

          <p className="mt-6 text-lg md:text-xl text-muted-brown leading-[1.85] max-w-xl">
            סדרת וובינרים בגישת <span className="text-cream font-semibold">Deal Flow</span>, המלווה את עורך הדין לאורך כל שלבי עסקת הנדל״ן,
            מהשיחה הראשונה עם הלקוח ועד השלמת רישום הזכויות,
            בשילוב כלי <span className="ltr-inline font-semibold text-cream">AI</span> ופרקטיקה יישומית בכל שלב.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <a
              href="#register"
              className="group inline-flex items-center justify-center gap-3 bg-gold text-ink px-7 py-4 rounded-md text-[15px] font-semibold hover:bg-gold-deep transition-all duration-300 hover:-translate-y-0.5 shadow-[0_1px_0_var(--gold)]"
            >
              <div className="flex flex-col items-center leading-tight">
                <span>הרשמה לוובינר הפתוח</span>
                <span className="ltr-inline text-ink/80 text-[10px] tracking-[0.2em] uppercase font-bold">FREE</span>
              </div>
            </a>
            <a
              href="https://chat.whatsapp.com/ENkngJp5Nb66DlhZ8gS4a0"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 border border-gold/50 text-cream px-5 py-3 rounded-md text-sm font-medium hover:border-gold hover:bg-gold/10 transition-all duration-300"
            >
              <MessageCircle size={18} className="text-green-500 fill-green-500/20" />
              הצטרפו לקבוצת הוואטסאפ שלנו:<br />אתם law לבד!
            </a>
          </div>

          <div className="mt-8 flex items-center gap-6 text-xs text-muted-brown">
            <div className="flex flex-col">
              <span className="ltr-inline font-serif text-2xl text-cream">14+</span>
              <span className="tracking-wider">מפגשים</span>
            </div>
            <span className="w-px h-8 bg-border" />
            <div className="flex flex-col">
              <span className="ltr-inline font-serif text-2xl text-cream">90</span>
              <span className="tracking-wider">דקות למפגש</span>
            </div>

            <span className="w-px h-8 bg-border" />
            <div className="flex flex-col">
              <span className="ltr-inline font-serif text-2xl text-cream">100%</span>
              <span className="tracking-wider">פרקטי ויישומי</span>
            </div>
          </div>
        </div>

        <div className="relative fade-rise">
          <div className="relative aspect-[4/5] w-full max-w-md mx-auto">
            {/* animated gold frame line */}
            <svg
              className="absolute -inset-[2px] w-[calc(100%+4px)] h-[calc(100%+4px)] z-0 pointer-events-none rounded-sm"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <rect
                x="0"
                y="0"
                width="100"
                height="100"
                fill="none"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                className="gold-frame-travel"
                rx="2"
              />
            </svg>
            <div className="absolute inset-0 bg-sand rounded-sm ring-1 ring-gold/20" />
            <img
              src={yifatPhoto}
              alt="עו״ד יפעת בן דוד עמית"
              className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] object-cover rounded-sm grayscale-[10%] mix-blend-luminosity opacity-95"
            />
          </div>
          <div className="mt-6 text-center md:text-right">
            <div className="text-xs tracking-[0.24em] uppercase text-gold ltr-inline">Instructor</div>
            <div className="mt-2 font-serif text-2xl text-cream">עו״ד יפעת בן דוד עמית</div>
            <div className="text-sm text-muted-brown mt-1">מייסדת משרד IBDA</div>
          </div>
        </div>
      </div>
      <Divider />
    </section>
  );
}

/* -------------------------- divider -------------------------- */

function Divider() {
  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="hairline" />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 justify-center mb-4">
      <span className="w-8 h-px bg-gold" />
      <span className="text-[11px] tracking-[0.28em] uppercase text-gold font-semibold ltr-inline">
        {children}
      </span>
      <span className="w-8 h-px bg-gold" />
    </div>
  );
}

/* -------------------------- model / cards -------------------------- */

function ModelSection() {
  const cards = [
    {
      stage: "שלב א׳",
      tag: "פתוח לקהל הרחב",
      title: "וובינר פתוח",
      lines: ["מפגש היכרות ראשוני", "90 דקות", "ללא תשלום"],
      href: "#stage-open",
      icon: MonitorPlay,
    },
    {
      stage: "שלב ב׳",
      tag: "סדרת הליבה",
      title: "זרימת העסקה",
      lines: ["9 וובינרים מקצועיים", "90 דקות למפגש"],
      featured: true,
      href: "#stage-core",
      icon: BookOpen,
    },
    {
      stage: "שלב ג׳",
      tag: "מרוכז",
      title: "סדנאות פרימיום",
      lines: [
        "ליטיגציה בנדל״ן",
        "רישום בית משותף · סדנא מורחבת",
        "שיתוף במקרקעין",
        "AI ואוטומציות בעבודת עורך הדין",
      ],
      href: "#stage-premium",
      icon: Building2,
    },
  ];
  return (
    <section id="model" className="py-10 md:py-14">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-10">
          <SectionLabel>The Model</SectionLabel>
          <h2 className="font-serif text-4xl md:text-5xl text-gold">שלושה מסלולים. עומק אחד.</h2>
          <p className="mt-5 text-muted-brown max-w-2xl mx-auto text-[17px]">
            מבנה מדורג שבנוי להעניק לעורך הדין ידע יישומי מלא, מהחשיפה הראשונה ועד להתמחות מרוכזת בסוגיות המורכבות ביותר בפרקטיקה.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 md:gap-6">
          {cards.map((c) => (
            <div
              key={c.title}
              className={cn(
                "group relative rounded-2xl p-[1px] transition-all duration-500 ease-out hover:-translate-y-1.5 bg-gradient-to-br",
                c.featured
                  ? "from-gold via-gold/70 to-gold/20 shadow-[0_0_40px_-12px_rgba(196,164,97,0.25)]"
                  : "from-gold/50 via-gold/15 to-gold/5 hover:from-gold hover:via-gold/60 hover:shadow-[0_0_30px_-12px_rgba(196,164,97,0.2)]",
              )}
            >
              <a
                href={c.href}
                className={cn(
                  "relative block h-full rounded-[15px] p-6 md:p-8 card-shimmer overflow-hidden",
                  "bg-sand-warm",
                  "shadow-[0_1px_0_rgba(196,164,97,0.12),0_20px_40px_-24px_rgba(0,0,0,0.6)]",
                  "transition-all duration-500 ease-out",
                  "hover:shadow-[0_1px_0_rgba(196,164,97,0.35),0_30px_60px_-20px_rgba(0,0,0,0.75)]",
                  c.featured && "ring-1 ring-gold/40",
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-gold/[0.07] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[15px]" />
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] tracking-[0.24em] uppercase text-gold font-semibold">
                    {c.tag}
                  </span>
                  <span className="font-serif text-sm text-muted-brown group-hover:text-gold transition-colors">
                    {c.stage}
                  </span>
                </div>
                <div className="mb-4 text-gold/80 group-hover:text-gold transition-colors duration-500 flex justify-center">
                  <c.icon strokeWidth={1} className="w-9 h-9" />
                </div>
                <h3 className="font-serif text-3xl md:text-4xl text-cream mb-5 transition-colors text-center">
                  {c.title}
                </h3>
                <div className="hairline mb-5 opacity-60" />
                <ul className="space-y-3">
                  {c.lines.map((l) => (
                    <li
                      key={l}
                      className="flex items-start gap-2 text-[15px] text-muted-brown"
                    >
                      <span className="text-gold mt-2.5 w-1 h-1 rounded-full bg-gold shrink-0" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
                <span
                  className="absolute bottom-5 left-6 text-gold opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-sm ltr-inline"
                  aria-hidden
                >
                  ←
                </span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------- open webinars -------------------------- */

function OpenWebinarsSection({ data }: { data: typeof openWebinars }) {
  const [open, setOpen] = useState<string | null>(null);
  const { open: openRegister } = useRegistrationModal();
  return (
    <section id="stage-open" className="py-10 md:py-14">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-10">
          <SectionLabel>Stage I · Open</SectionLabel>
          <h2 className="font-serif text-4xl md:text-5xl text-gold">שלב א׳ · הוובינר הפתוח</h2>
          <p className="mt-5 text-muted-brown text-[17px]">
            מקוון · מפגש של 90 דקות · ללא תשלום · פתוח לכלל עורכי הדין
          </p>
        </div>

        <div className="space-y-6">
          {data.map((w) => {
            const isOpen = open === w.n;
            return (
              <div
                key={w.n}
                className="bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg p-6 md:p-8 hover:border-gold/40 transition-all duration-300 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.5)]"
              >
                <div className="grid md:grid-cols-[auto_1fr] gap-5 md:gap-8 items-start">
                  <div className="font-serif text-5xl text-gold ltr-inline leading-none">{w.n}</div>
                  <div>
                    <h3 className="font-serif text-3xl md:text-4xl text-cream mb-3">{w.title}</h3>
                    <p className="text-muted-brown text-[15.5px] leading-[1.85]">{w.desc}</p>
                  </div>
                </div>

                <div className="mt-6 md:mr-20 flex flex-wrap items-center gap-3">
                  {w.dateLabel && (
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-cream bg-gold/10 border border-gold/40 px-4 py-2 rounded-md">
                      <Calendar size={16} className="text-gold" />
                      <span>{w.dateLabel}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setOpen(isOpen ? null : w.n)}
                    className="group inline-flex items-center gap-2 text-sm font-semibold text-cream border border-gold/60 px-5 py-2.5 rounded-md hover:bg-gold hover:text-ink transition-all duration-300"
                  >
                    נושאי המפגש
                    <ChevronDown
                      className={cn(
                        "shrink-0 transition-transform duration-300",
                        isOpen && "rotate-180",
                      )}
                      size={16}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => openRegister("open")}
                    className="inline-flex items-center gap-2 text-sm font-semibold bg-gold text-ink px-5 py-2.5 rounded-md hover:bg-gold-deep hover:text-cream transition-all duration-300 btn-shimmer"
                  >
                    <span className="relative z-10">להרשמה</span>
                  </button>
                </div>

                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out",
                    isOpen ? "grid-rows-[1fr] opacity-100 mt-5" : "grid-rows-[0fr] opacity-0 mt-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <ul className="space-y-3 pr-1">
                      {w.topics.map((topic, i) => (
                        <li key={i} className="flex items-start gap-3 text-[15px] text-muted-brown leading-[1.7]">
                          <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                          <span>{topic}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex items-start gap-4 bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-md p-6">
          <Sparkles className="text-gold shrink-0 mt-1" size={18} />
          <p className="text-sm text-muted-brown leading-[1.8]">
            <span className="text-cream font-semibold">הטבת </span>
            <span className="ltr-inline text-cream font-semibold tracking-wider">Early Bird</span>
            <span className="text-cream font-semibold"> למשתתפים.</span>{" "}
            משתתפי הוובינר הפתוח יקבלו הצעה מוזלת לרכישת סדרת הליבה המלאה, תקפה ל<span className="ltr-inline font-semibold">72</span> שעות מסיום הוובינר.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------- core series accordion -------------------------- */

function CoreSeriesSection({ data }: { data: typeof coreSeries }) {
  const [open, setOpen] = useState<number | null>(null);
  const { open: openRegister } = useRegistrationModal();
  return (
    <section id="stage-core" className="py-10 md:py-14">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-10">
          <SectionLabel>Stage II · Deal Flow</SectionLabel>
          <h2 className="font-serif text-4xl md:text-5xl text-gold mb-5">שלב ב׳ · סדרת הליבה</h2>
          <div className="relative flex flex-col md:block items-center gap-4">
            <p className="text-muted-brown text-[15px] sm:text-[17px] text-center px-4">
              מקוון · 9 מפגשים של 90 דקות · לפי שלבי העסקה, מהתחלה ועד רישום
            </p>
            <button
              type="button"
              onClick={() => openRegister("core_full")}
              className="md:absolute md:left-0 md:top-1/2 md:-translate-y-1/2 inline-flex items-center gap-2 text-sm font-semibold bg-gold text-ink px-5 py-2.5 rounded-md transition-all duration-300 btn-shimmer shrink-0"
            >
              <span className="relative z-10">לרכישת סדרת הליבה</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {data.map((w, i) => {
            const isOpen = open === i;
            return (
              <div key={w.t} className="bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 py-5 px-4 sm:px-5 md:px-6">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex items-start gap-3 sm:gap-5 min-w-0 text-right group cursor-pointer w-full md:w-auto md:flex-1"
                  >
                    <span className="font-serif text-lg text-gold ltr-inline w-7 sm:w-8 shrink-0 pt-1">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="shrink-0 pt-0.5 text-gold/70 group-hover:text-gold transition-colors">
                      <w.icon size={24} strokeWidth={1.25} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-xl sm:text-2xl md:text-3xl text-cream group-hover:text-gold transition-colors leading-tight">
                        {w.t}
                      </span>
                      <span className="block mt-1.5 text-muted-brown text-[13.5px] sm:text-[14.5px] md:text-[15px] leading-[1.7]">
                        {w.d}
                      </span>
                      <span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-cream bg-gold/10 border border-gold/40 px-3 py-1.5 rounded-md">
                        <Calendar size={14} className="text-gold" />
                        <span>{w.date}</span>
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pr-10 md:pr-0">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="shrink-0 w-9 h-9 rounded-full border border-gold/30 flex items-center justify-center hover:bg-gold/10 hover:border-gold/60 transition-all duration-300 cursor-pointer"
                      aria-label={isOpen ? "סגור" : "פתח"}
                    >
                      <ChevronDown
                        className={cn(
                          "text-muted-brown transition-transform duration-300",
                          isOpen && "rotate-180 text-gold",
                        )}
                        size={20}
                      />
                    </button>
                  </div>
                </div>
                <div
                  className={cn(
                    "grid transition-all duration-300",
                    isOpen ? "grid-rows-[1fr] opacity-100 pb-6" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="pr-14 pl-4">
                      <ul className="space-y-2.5">
                        {w.topics.map((topic, ti) => (
                          <li key={ti} className="flex items-start gap-3 text-[14.5px] text-muted-brown leading-[1.75]">
                            <span className="mt-2 w-1 h-1 rounded-full bg-gold shrink-0" />
                            <span>{topic}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------- premium workshops -------------------------- */

function PremiumSection({ data }: { data: typeof premiumWorkshops }) {
  const [open, setOpen] = useState<number | null>(null);
  const { open: openRegister } = useRegistrationModal();
  const premiumIds = PREMIUM_WORKSHOP_IDS;

  // Magazine layout mapping: one large featured card on the right (AI), three compact cards on the left
  const featuredIndex = 3;
  const featured = data[featuredIndex];
  const featuredId = premiumIds[featuredIndex];
  const leftWorkshops = [data[0], data[1], data[2]];
  const leftIds = [premiumIds[0], premiumIds[1], premiumIds[2]];

  const renderMeta = (w: typeof premiumWorkshops[0]) => (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream bg-gold/10 border border-gold/30 px-2.5 py-1 rounded-md">
        <Calendar size={13} className="text-gold" />
        {w.date}
      </span>
      <span className="text-[11px] tracking-[0.2em] uppercase text-gold font-semibold">
        {w.meta}
      </span>
    </div>
  );

  const renderTopics = (w: typeof premiumWorkshops[0], i: number, isOpen: boolean, featuredCard = false) => (
    <div
      className={cn(
        "grid transition-all duration-300 ease-out",
        isOpen ? "grid-rows-[1fr] opacity-100 mt-5" : "grid-rows-[0fr] opacity-0 mt-0",
      )}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "mb-4 opacity-50",
            featuredCard ? "h-px bg-gradient-to-l from-transparent via-gold/50 to-transparent" : "hairline",
          )}
        />
        <ul className="space-y-3">
          {w.topics.map((topic, ti) => (
            <li key={ti} className="flex items-start gap-3 text-[14px] text-cream leading-[1.75]">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
              <span>{topic}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <section id="stage-premium" className="py-6 md:py-8">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center border-b border-gold/20 pb-5 gap-3 mb-6">
          <span className="text-[11px] tracking-[0.28em] uppercase text-gold font-semibold ltr-inline">
            Stage III · Premium
          </span>
          <h2 className="font-serif text-4xl md:text-5xl text-gold leading-tight">
            שלב ג׳ · סדנאות מרוכזות
          </h2>
        </div>

        {/* Magazine Grid — large featured card on the right, three compact cards on the left */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
          {/* Right column — large featured AI card (first in DOM so it sits on the visual right in RTL) */}
          <article className="group relative overflow-hidden bg-gradient-to-br from-sand via-ink to-void border border-gold/30 rounded-2xl h-full min-h-[200px] md:min-h-[260px] flex flex-col justify-end p-3 md:p-4 transition-all duration-500 hover:border-gold/60 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-void via-ink/90 to-sand/30" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(196,164,97,0.15),transparent_55%)]" />
            <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.07] via-transparent to-transparent opacity-60" />

            <AnimatedCardIcon Icon={Sparkles} size={160} className="left-[10%] md:left-[14%] top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 group-hover:opacity-75 transition-opacity duration-500" strokeWidth={0.9} />

            <span className="absolute top-3 right-3 font-serif text-4xl md:text-5xl text-gold/20 group-hover:text-gold/40 transition-colors z-10">
              01
            </span>

            <div className="relative z-10">
              <span className="inline-flex items-center gap-2 px-2.5 py-1 bg-gold text-ink text-[11px] font-bold tracking-tighter w-fit rounded-md mb-2">
                <Sparkles size={12} />
                סדנא מובילה
              </span>

              <div className="mb-1">
                <h3 className="font-serif text-lg md:text-xl text-cream leading-snug">{featured.t}</h3>
              </div>

              <p className="text-muted-brown text-[13px] leading-snug mb-3 max-w-lg line-clamp-2">
                {featured.d}
              </p>

              <div className="mb-3">{renderMeta(featured)}</div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTicketAction(featuredId, openRegister)}
                  className="inline-flex items-center justify-center gap-2 bg-gold text-ink px-4 py-2 rounded-md text-sm font-semibold hover:bg-gold-deep hover:text-cream transition-all duration-300 shadow-sm btn-pulse-glow btn-shimmer"
                >
                  לרכישת הסדנא
                </button>

                <button
                  onClick={() => setOpen(open === featuredIndex ? null : featuredIndex)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-cream hover:text-gold transition-colors"
                >
                  {open === featuredIndex ? "סגור פרטים" : "פרטים נוספים"}
                  <ChevronDown size={16} className={cn("transition-transform", open === featuredIndex && "rotate-180")} />
                </button>
              </div>

              {renderTopics(featured, featuredIndex, open === featuredIndex, true)}
            </div>
          </article>

          {/* Left column — three compact workshop cards (second in DOM so they sit on the visual left in RTL) */}
          <div className="flex flex-col gap-2">
            {leftWorkshops.map((w, idx) => {
              const originalIndex = idx;
              const isOpen = open === originalIndex;
              const icons = [SearchCheck, Building2, Handshake];
              const Icon = icons[idx];
              return (
                <article
                  key={w.t}
                  className="relative overflow-hidden bg-gradient-to-l from-sand to-void backdrop-blur-xl border border-cream/5 border-r-4 border-r-gold rounded-l-2xl p-2.5 md:p-3 flex flex-col justify-between transition-all duration-300 hover:border-gold/40 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl hover:shadow-gold/20 group shadow-lg shadow-black/40"
                >
                  <AnimatedCardIcon Icon={Icon} size={72} className="left-10 md:left-14 top-1/2 -translate-y-1/2 z-0 group-hover:opacity-65 transition-opacity duration-500" strokeWidth={0.8} />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-serif text-base md:text-lg text-cream leading-snug group-hover:text-gold transition-colors line-clamp-1 min-w-0">
                          {w.t}
                        </h3>
                        <span className="text-[11px] tracking-[0.15em] uppercase text-gold font-semibold shrink-0">
                          {w.meta}
                        </span>
                      </div>
                      <span className="font-serif text-xl text-gold/20 group-hover:text-gold/40 transition-colors shrink-0">
                        0{idx + 2}
                      </span>
                    </div>
                    <p className="text-muted-brown text-[13px] leading-snug line-clamp-1">{w.d}</p>
                  </div>

                  <div className="mt-1.5 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream bg-gold/10 border border-gold/30 px-2.5 py-1 rounded-md">
                        <Calendar size={13} className="text-gold" />
                        {w.date}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTicketAction(leftIds[idx], openRegister)}
                        className="inline-flex items-center justify-center gap-2 bg-gold text-ink px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-gold-deep hover:text-cream transition-all duration-300 shadow-sm"
                      >
                        לרכישת הסדנא
                      </button>
                      <button
                        onClick={() => setOpen(isOpen ? null : originalIndex)}
                        className="w-7 h-7 rounded-full border border-cream/20 flex items-center justify-center hover:bg-gold/10 hover:border-gold/60 transition-all cursor-pointer sm:mr-auto"
                        aria-label={isOpen ? "סגור" : "פתח"}
                      >
                        <ChevronDown
                          className={cn(
                            "text-muted-brown transition-transform duration-300",
                            isOpen && "rotate-180 text-gold",
                          )}
                          size={14}
                        />
                      </button>
                    </div>

                    {renderTopics(w, originalIndex, isOpen)}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------- pricing -------------------------- */

function PricingSection() {
  const [openGroup, setOpenGroup] = useState(false);
  const [openPolicy, setOpenPolicy] = useState(false);
  const { open } = useRegistrationModal();


  return (
    <section id="pricing" className="py-10 md:py-14">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="flex items-center gap-3 justify-center mb-4">
            <span className="w-8 h-px bg-gold" />
            <span className="text-[11px] tracking-[0.28em] uppercase text-gold font-semibold ltr-inline">
              Investment
            </span>
            <span className="w-8 h-px bg-gold" />
          </div>
          <h2 className="font-serif text-4xl md:text-5xl text-gold">מסלולי השקעה</h2>
          <p className="mt-5 text-muted-brown text-[17px] max-w-2xl mx-auto font-medium">
            מחירים מדויקים להרשמה מוקדמת. ההטבה בתוקף ל 72 שעות מסיום הוובינר הפתוח.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {pricing.map((p) => {
            const isComingSoon = p.comingSoon;
            const cardClasses = cn(
              "group relative bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg p-7 flex flex-col text-right shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)] transition-all duration-300",
              !isComingSoon && "hover:-translate-y-1 hover:border-gold/70 hover:shadow-[0_20px_50px_-15px_rgba(196,164,97,0.35)] cursor-pointer",
              isComingSoon && "opacity-60 cursor-not-allowed",
              p.featured && "border-gold/70",
            );
            const cardContent = (
              <>
                {p.featured && !isComingSoon && (
                  <span className="absolute -top-3 right-6 bg-gold text-ink text-[10px] font-semibold tracking-[0.22em] uppercase px-3 py-1 rounded ltr-inline">
                    Most Popular
                  </span>
                )}
                {isComingSoon && (
                  <span className="absolute -top-3 right-6 bg-gold/80 text-ink text-[10px] font-semibold tracking-[0.22em] uppercase px-3 py-1 rounded ltr-inline">
                    בקרוב
                  </span>
                )}
                <div className="text-sm tracking-[0.22em] uppercase font-semibold mb-2 text-gold">
                  {p.t}
                </div>
                {p.duration && (
                  <div className="text-[13px] tracking-[0.18em] uppercase text-muted-brown font-semibold mb-3">
                    {p.duration}
                  </div>
                )}

                {p.free ? (
                  <div className="font-serif text-4xl mb-3 text-cream font-medium">ללא תשלום</div>
                ) : (
                  <>
                    <div className={cn("font-serif text-2xl mb-1 ltr-inline line-through text-muted-brown", isComingSoon ? "opacity-30" : "opacity-50")}>
                      {p.price}
                    </div>
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className={cn("font-serif text-4xl ltr-inline font-medium", isComingSoon ? "text-cream/60" : "text-cream")}>
                        {p.early}
                      </span>
                      <span className={cn("text-[10px] tracking-[0.2em] uppercase font-semibold ltr-inline", isComingSoon ? "text-gold/60" : "text-gold")}>
                        Early Bird
                      </span>
                    </div>
                  </>
                )}

                <p className={cn("text-xs leading-relaxed font-medium flex-1", isComingSoon ? "text-muted-brown/60" : "text-muted-brown")}>
                  {p.note}
                </p>

                <span
                  className={cn(
                    "mt-6 inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-semibold tracking-wide transition-colors",
                    isComingSoon
                      ? "bg-cream/10 text-muted-brown border border-cream/10"
                      : p.featured
                        ? "btn-shimmer bg-gold text-ink group-hover:bg-gold-deep"
                        : "btn-shimmer border border-gold/60 text-cream group-hover:bg-gold group-hover:text-ink",
                  )}
                >
                  <span className="relative z-10">{isComingSoon ? "בקרוב" : p.cta}</span>
                </span>
              </>
            );
            return isComingSoon ? (
              <div key={p.id} className={cardClasses}>{cardContent}</div>
            ) : (
              <button
                type="button"
                key={p.id}
                onClick={() => handleTicketAction(p.id, open)}
                className={cardClasses}
              >
                {cardContent}
              </button>
            );
          })}
        </div>


        {/* what's included */}
        <div className="mt-12 bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg p-8 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)]">
          <h3 className="font-serif text-2xl text-gold mb-6 text-center">
            מה כלול בכל רכישה
          </h3>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-4 max-w-3xl mx-auto">
            {includedItems.map((it) => (
              <li key={it} className="flex items-start gap-3 text-muted-brown text-[15px] leading-relaxed">
                <span className="mt-1 flex-shrink-0 w-5 h-5 rounded-full border border-gold/60 flex items-center justify-center text-gold">
                  <Check size={12} strokeWidth={3} />
                </span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* group discounts */}
        <div className="mt-8 bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenGroup((v) => !v)}
            className="w-full flex items-center justify-between px-7 py-5 text-right"
            aria-expanded={openGroup}
          >
            <div>
              <div className="text-[11px] tracking-[0.22em] uppercase text-gold font-semibold mb-1">
                For Firms
              </div>
              <h3 className="font-serif text-xl text-gold">הנחות כמות ומסלולים למשרדים</h3>
            </div>
            <ChevronDown
              size={20}
              className={cn("text-gold transition-transform", openGroup && "rotate-180")}
            />
          </button>
          {openGroup && (
            <div className="px-7 pb-7 grid sm:grid-cols-2 gap-5 border-t border-cream/10 pt-6">
              {groupDiscounts.map((g) => (
                <div key={g.t} className="border border-cream/10 rounded-md p-5 bg-ink/30">
                  <div className="text-cream font-serif text-lg mb-2">{g.t}</div>
                  <p className="text-muted-brown text-sm leading-relaxed">{g.d}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* cancellation policy */}
        <div className="mt-6 bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenPolicy((v) => !v)}
            className="w-full flex items-center justify-between px-7 py-5 text-right"
            aria-expanded={openPolicy}
          >
            <div>
              <div className="text-[11px] tracking-[0.22em] uppercase text-gold font-semibold mb-1">
                Policy
              </div>
              <h3 className="font-serif text-xl text-gold">מדיניות הרשמה וביטולים</h3>
            </div>
            <ChevronDown
              size={20}
              className={cn("text-gold transition-transform", openPolicy && "rotate-180")}
            />
          </button>
          {openPolicy && (
            <ul className="px-7 pb-7 pt-5 border-t border-cream/10 space-y-3">
              {cancellationPolicy.map((line) => (
                <li key={line} className="flex items-start gap-3 text-muted-brown text-sm leading-relaxed">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-muted-brown font-medium">
          כל המחירים המצוינים הם בתוספת מע״מ כחוק.
        </p>
      </div>
    </section>
  );
}



/* -------------------------- registration -------------------------- */

// מזהי החבילות הפרימיום שמוצגות בטופס הבחירה.
const _PREMIUM_IDS = [
  "premium_litigation",
  "premium_registration",
  "premium_partnership",
  "premium_ai",
  "premium_bundle",
] as const;


// תשתית לינקים חיצוניים לסליקה. יש להחליף בקישורים אמיתיים כשיהיו מוכנים.
const PAYMENT_LINKS: Record<string, string> = {
  core_single: "https://payment-link-placeholder.com/core-single",
  core_full: "https://payment-link-placeholder.com/core-full",
  premium_litigation: "https://payment-link-placeholder.com/premium-litigation",
  premium_registration: "https://payment-link-placeholder.com/premium-registration",
  premium_partnership: "https://payment-link-placeholder.com/premium-partnership",
  premium_ai: "https://payment-link-placeholder.com/premium-ai",
  premium_bundle: "https://payment-link-placeholder.com/premium-bundle",
};

// סדר עדיפויות לניתוב: החבילה היקרה או המקיפה ביותר מנצחת.
const PAID_PRIORITY: string[] = [
  "premium_bundle",
  "core_full",
  "premium_registration",
  "premium_partnership",
  "premium_litigation",
  "premium_ai",
  "core_single",
];

function resolvePrimaryPaidPackage(selected: Set<string>): string | null {
  for (const id of PAID_PRIORITY) {
    if (selected.has(id)) return id;
  }
  return null;
}

const InlineRegSchema = z.object({
  first_name: z.string().trim().min(1, "יש להזין שם פרטי").max(100),
  last_name: z.string().trim().min(1, "יש להזין שם משפחה").max(100),
  email: z.string().trim().email("כתובת אימייל לא תקינה").max(255),
  phone: z.string().trim().min(6, "מספר טלפון קצר מדי").max(20),
  firm_name: z.string().trim().max(120).optional().or(z.literal("")),
  bar_license: z.string().trim().max(20).optional().or(z.literal("")),
  id_number: z.string().trim().max(20).optional().or(z.literal("")),
});

function RegistrationSection() {
  const navigate = useNavigate();
  const { selected, toggle, coreLesson } = useRegistrationModal();
  const [first_name, setFirstName] = useState("");
  const [last_name, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firm_name, setFirmName] = useState("");
  const [bar_license, setBarLicense] = useState("");
  const [id_number, setIdNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coreSingleLesson, setCoreSingleLesson] = useState<string>("");
  const coreSingleRef = useRef<HTMLDivElement>(null);
  const coreSingleSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (coreLesson && selected.has("core_single")) {
      setCoreSingleLesson(coreLesson);
    }
  }, [coreLesson, selected]);

  const hasPaid = Boolean(resolvePrimaryPaidPackage(selected));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const parsed = InlineRegSchema.safeParse({ first_name, last_name, email, phone, firm_name, bar_license, id_number });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (errs[i.path.join(".")] = i.message));
      setErrors(errs);
      return;
    }
    if (hasPaid && (parsed.data.id_number || "").trim().length < 5) {
      setErrors({ id_number: "מספר ת.ז / ח.פ הכרחי לצורך הפקת חשבונית" });
      toast.error("יש להזין מספר ת.ז או ח.פ תקין");
      return;
    }
    if (selected.size === 0) {
      setErrors({ packages: "יש לבחור לפחות מסלול או חבילה אחת" });
      return;
    }
    if (selected.has("core_single") && !coreSingleLesson) {
      const msg = "יש לבחור את סוג המפגש הרצוי";
      setErrors({ core_single_lesson: msg });
      setTimeout(() => {
        coreSingleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        coreSingleSelectRef.current?.focus();
      }, 50);
      toast.error(msg, {
        description: "לא ניתן להשלים את ההרשמה ללא בחירת מפגש מסדרת הליבה.",
        duration: 8000,
      });
      return;
    }
    setErrors({});
    setConfirmOpen(true);
  }

  async function performSubmit() {
    setConfirmOpen(false);
    const parsed = InlineRegSchema.safeParse({ first_name, last_name, email, phone, firm_name, bar_license, id_number });
    if (!parsed.success) return;
    setSubmitting(true);

    const primaryPaid = resolvePrimaryPaidPackage(selected);

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
          core_single_lesson: selected.has("core_single") ? coreSingleLesson : undefined,
          core_single_lesson_index: selected.has("core_single")
            ? (() => {
                const idx = coreSeries.findIndex((l) => l.t === coreSingleLesson);
                return idx >= 0 ? idx + 1 : undefined;
              })()
            : undefined,
        },
      });
    } catch (err) {
      setSubmitting(false);
      setServerError("אירעה תקלה בשליחת ההרשמה. אנא נסו שוב בעוד רגע.");
      return;
    }

    if (primaryPaid) {
      try {
        const orderRef = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { payment_url } = await createSumitPayment({
          data: {
            package_id: primaryPaid,
            email: parsed.data.email,
            full_name: `${parsed.data.first_name} ${parsed.data.last_name}`.trim(),
            phone: parsed.data.phone,
            order_reference: orderRef,
            id_number: parsed.data.id_number || "",
          },
        });
        if (typeof window !== "undefined" && payment_url) {
          window.location.href = payment_url;
          return;
        }
      } catch (err) {
        console.error("Sumit payment error", err);
        setSubmitting(false);
        setServerError("אירעה תקלה ביצירת דף התשלום. אנא נסו שוב או פנו אלינו.");
        return;
      }
    }

    // No paid package selected (free open-webinar registration) — send them
    // to the full thank-you/offers page, same as the standalone /webinar
    // flow, instead of a dead-end inline success card.
    navigate({ to: "/thank-you" });
  }



  return (
    <section id="register" className="py-10 md:py-14 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-8">
          <SectionLabel>Registration</SectionLabel>
          <h2 className="font-serif text-4xl md:text-5xl text-cream">שמרו את מקומכם</h2>
          <p className="mt-5 text-muted-brown text-[18px]">
            מלאו פרטים ובחרו את המסלולים המבוקשים. ניצור עמכם קשר להשלמת התהליך.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="glass-gold rounded-2xl p-6 md:p-9 fade-rise"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
              {/* Right column on desktop: personal details */}
              <div className="order-2 md:order-1 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <InlineField label="שם פרטי" required value={first_name} onChange={setFirstName} error={errors.first_name} />
                  <InlineField label="שם משפחה" required value={last_name} onChange={setLastName} error={errors.last_name} />
                  <InlineField label="אימייל" type="email" required value={email} onChange={setEmail} error={errors.email} dir="ltr" />
                  <InlineField label="טלפון נייד" type="tel" required value={phone} onChange={setPhone} error={errors.phone} dir="ltr" />
                  <InlineField label="שם המשרד או חברה" value={firm_name} onChange={setFirmName} />
                  <InlineField label="מספר רישיון עריכת דין" value={bar_license} onChange={setBarLicense} dir="ltr" />
                  {hasPaid && (
                    <InlineField
                      label="ת.ז / ח.פ (לצורך הפקת חשבונית)"
                      required
                      value={id_number}
                      onChange={setIdNumber}
                      error={errors.id_number}
                      dir="ltr"
                    />
                  )}
                </div>

                <div className="hairline opacity-60" />

                {serverError && (
                  <div className="text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded p-3">
                    {serverError}
                  </div>
                )}
              </div>

              {/* Left column on desktop: sticky package selection */}
              <div className="order-1 md:order-2 md:sticky md:top-24 space-y-3">
                <fieldset className="space-y-3">
                  <legend className="text-[12px] tracking-[0.24em] uppercase text-gold font-semibold mb-3">
                    בחירת מסלולים וחבילות
                  </legend>
                  <div className="grid gap-2.5">
                    {pricing.map((p) => {
                      const isChecked = selected.has(p.id);
                      const isComingSoon = p.comingSoon;
                      return (
                        <div key={p.id} className="space-y-2">
                          <label
                            className={cn(
                              "flex items-center justify-between gap-4 rounded-md border px-4 py-3 transition-colors",
                              isComingSoon
                                ? "border-cream/10 bg-ink/20 cursor-not-allowed opacity-60"
                                : isChecked
                                  ? "border-gold bg-gold/10 cursor-pointer"
                                  : "border-cream/15 bg-ink/30 hover:border-gold/50 cursor-pointer",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-all",
                                  isChecked ? "bg-gold border-gold text-ink" : "border-taupe",
                                  isComingSoon && "opacity-50",
                                )}
                              >
                                {isChecked && <Check size={13} strokeWidth={3} />}
                              </span>
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={isChecked}
                                disabled={isComingSoon}
                                onChange={() => !isComingSoon && toggle(p.id)}
                              />
                              <div className="flex flex-col">
                                <span className={cn("text-[15px] font-medium", isComingSoon ? "text-cream/70" : "text-cream")}>{p.t}</span>
                                {p.duration && (
                                  <span className={cn("text-[13px] tracking-[0.14em] uppercase mt-0.5", isComingSoon ? "text-muted-brown/50" : "text-muted-brown")}>{p.duration}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {isComingSoon && (
                                <span className="text-[11px] tracking-[0.18em] uppercase font-semibold text-gold/80 bg-gold/10 border border-gold/30 px-2 py-1 rounded">
                                  בקרוב
                                </span>
                              )}
                              {!p.free && p.price && (
                                <span className={cn("text-muted-brown ltr-inline text-[13px] line-through", isComingSoon ? "opacity-30" : "opacity-60")}>
                                  {p.price}
                                </span>
                              )}
                              <span className={cn("ltr-inline text-[14px] font-semibold", isComingSoon ? "text-gold/50" : "text-gold")}>
                                {p.free ? "ללא תשלום" : p.early}
                              </span>
                            </div>
                          </label>

                          {p.id === "core_single" && isChecked && !isComingSoon && (
                            <div
                              ref={coreSingleRef}
                              className={cn(
                                "mr-8 rounded-md border p-3 transition-colors",
                                errors.core_single_lesson
                                  ? "border-destructive bg-destructive/10 animate-pulse"
                                  : "border-gold/40 bg-ink/40",
                              )}
                            >
                              <label className="block text-[12px] tracking-[0.18em] uppercase text-gold font-semibold mb-2">
                                בחרו את המפגש הרצוי
                              </label>
                              <select
                                ref={coreSingleSelectRef}
                                value={coreSingleLesson}
                                onChange={(e) => setCoreSingleLesson(e.target.value)}
                                className={cn(
                                  "w-full bg-ink/60 border text-cream rounded px-3 py-2 text-[14px] focus:outline-none",
                                  errors.core_single_lesson
                                    ? "border-destructive focus:border-destructive"
                                    : "border-cream/20 focus:border-gold",
                                )}
                              >
                                <option value="">— בחרו מפגש —</option>
                                {coreSeries.map((lesson, idx) => (
                                  <option key={idx} value={lesson.t}>
                                    {idx + 1}. {lesson.t}
                                  </option>
                                ))}
                              </select>
                              {errors.core_single_lesson && (
                                <p className="text-destructive text-xs mt-2 font-semibold">{errors.core_single_lesson}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {errors.packages && (
                    <p className="text-destructive text-xs mt-2">{errors.packages}</p>
                  )}
                </fieldset>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                type="submit"
                disabled={submitting}
                className="btn-shimmer w-full max-w-md bg-gold text-ink py-4 rounded-md text-[15px] font-semibold hover:bg-gold-deep transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5"
              >
                <span className="relative z-10">{submitting ? "שולח..." : "שריון מקום ואישור הרשמה"}</span>
              </button>
            </div>
        </form>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl text-right">
              רגע לפני שממשיכים
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-right text-[15px] leading-relaxed text-muted-brown">
                {hasPaid && (
                  <div className="rounded-md border border-gold/30 bg-gold/5 p-4">
                    <p className="font-semibold text-cream mb-1">📄 חשבונית מס</p>
                    <p>
                      לאחר השלמת הרכישה בעמוד התשלום, תישלח אליך בדקות הקרובות
                      חשבונית מס במייל מטעם <strong>בן דוד עמית, חברת עורכי דין</strong>.
                    </p>
                  </div>
                )}
                <p className="text-sm">
                  לשאלות ותמיכה ניתן לפנות אלינו במייל:{" "}
                  <a
                    href="mailto:webinar@ibda-law.com"
                    className="text-gold hover:underline"
                    dir="ltr"
                  >
                    webinar@ibda-law.com
                  </a>
                </p>
                {hasPaid && (
                  <p className="text-sm">
                    בלחיצה על "המשך לתשלום" תועברו לעמוד התשלום המאובטח של Sumit.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={performSubmit}
              className="bg-gold text-ink hover:bg-gold-deep"
            >
              {hasPaid ? "הבנתי, המשך לתשלום" : "הבנתי, המשך להרשמה"}
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function InlineField({
  label,
  value,
  onChange,
  type = "text",
  required,
  error,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  error?: string;
  dir?: "ltr" | "rtl";
}) {
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

/* -------------------------- footer -------------------------- */

function Footer() {
  return (
    <footer className="py-8 border-t border-border">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src={ibdaLogo} alt="IBDA" className="h-8 w-auto" />
          <span className="text-xs tracking-[0.22em] text-muted-brown ltr-inline uppercase">
            IBDA · Law Firm
          </span>
        </div>
        <div className="text-xs text-muted-brown text-center md:text-right">
          © {new Date().getFullYear()} משרד עו״ד יפעת בן דוד עמית. כל הזכויות שמורות.
        </div>
      </div>
    </footer>
  );
}

