import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Calendar, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ibdaLogo from "@/assets/ibda-logo.png";
import yifatPhoto from "@/assets/yifat.jpg";
import { subscribeRegistration } from "@/lib/resend.functions";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { saveContact, loadContact } from "@/lib/checkout-client";

export const Route = createFileRoute("/webinar")({
  head: () => ({
    meta: [
      { title: "הרשמה לוובינר הפתוח · IBDA" },
      {
        name: "description",
        content: 'הרשמה חינמית לוובינר הפתוח של IBDA: כמה זה עולה לעשות עסקת נדל"ן?',
      },
    ],
  }),
  loader: async () => getScheduleData(),
  component: WebinarPage,
});

const OPEN_WEBINAR = {
  title: "כמה זה עולה לעשות עסקת נדל״ן?",
  desc: "השיחה המקדימה עם הלקוח, הגדרת השירות, קביעת שכר טרחה וניהול סיכונים לאורך העסקה.",
  dateLabel: "15.7 · 10:00",
  topics: [
    "השיחה המקדימה עם הלקוח: מה שואלים, איך מקשיבים, היכן בודקים",
    "הגדרת היקף השירות: מה כולל ומה לא כולל בשירות",
    "קביעת שכר טרחה: זמן, מורכבות, שווי הממכר, שיטות מקובלות, ועיגונים בפסיקה לשכר ראוי",
    "עריכת הסכם שכר טרחה: מבנה, סעיפים חיוניים, מנגנוני תשלום",
    "הדגמה live",
  ],
};

const RegSchema = z.object({
  first_name: z.string().trim().min(1, "יש להזין שם פרטי").max(100),
  last_name: z.string().trim().min(1, "יש להזין שם משפחה").max(100),
  email: z.string().trim().email("כתובת אימייל לא תקינה").max(255),
  phone: z.string().trim().min(6, "מספר טלפון קצר מדי").max(20),
  firm_name: z.string().trim().max(120).optional().or(z.literal("")),
  bar_license: z.string().trim().max(20).optional().or(z.literal("")),
});

function WebinarPage() {
  const { openSession } = Route.useLoaderData();
  const dateLabel = (openSession && formatSessionDate(openSession.starts_at)) || OPEN_WEBINAR.dateLabel;
  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60">
        <div className="max-w-3xl mx-auto flex items-center justify-center px-6 py-5">
          <img src={ibdaLogo} alt="IBDA" className="h-10 w-auto" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14">
        <section className="text-center mb-12 fade-rise">
          <div className="flex items-center gap-3 mb-5 justify-center">
            <span className="w-10 h-px bg-gold" />
            <span className="text-[11px] tracking-[0.28em] uppercase text-gold font-semibold ltr-inline">
              Free Webinar
            </span>
            <span className="w-10 h-px bg-gold" />
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl leading-tight text-shimmer mb-5">
            {OPEN_WEBINAR.title}
          </h1>
          <p className="text-muted-brown text-[17px] leading-[1.85] max-w-xl mx-auto mb-6">
            {OPEN_WEBINAR.desc}
          </p>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-cream bg-gold/10 border border-gold/40 px-4 py-2 rounded-md">
            <Calendar size={16} className="text-gold" />
            <span>{dateLabel}</span>
          </div>
        </section>

        <section className="mb-12">
          <div className="bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg p-6 md:p-8">
            <h2 className="font-serif text-xl text-gold mb-4">מה נלמד במפגש</h2>
            <ul className="space-y-3">
              {OPEN_WEBINAR.topics.map((topic, i) => (
                <li key={i} className="flex items-start gap-3 text-[15px] text-muted-brown leading-[1.7]">
                  <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                  <span>{topic}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mb-8 flex items-center gap-4 justify-center">
          <div className="relative w-24 h-28 shrink-0">
            <div className="absolute inset-0 bg-sand rounded-sm ring-1 ring-gold/20" />
            <img
              src={yifatPhoto}
              alt="עו״ד יפעת בן דוד עמית"
              className="absolute inset-1 w-[calc(100%-0.5rem)] h-[calc(100%-0.5rem)] object-cover rounded-sm grayscale-[10%] mix-blend-luminosity opacity-95"
            />
          </div>
          <div className="text-right">
            <div className="text-xs tracking-[0.2em] uppercase text-gold ltr-inline">Instructor</div>
            <div className="font-serif text-lg text-cream">עו״ד יפעת בן דוד עמית</div>
            <div className="text-sm text-muted-brown">מייסדת משרד IBDA</div>
          </div>
        </section>

        <RegistrationForm sessionId={openSession?.id} />

        <div className="mt-10 text-center">
          <a
            href="mailto:webinar@ibda-law.com"
            className="text-sm text-muted-brown hover:text-gold transition-colors"
          >
            שאלות? webinar@ibda-law.com
          </a>
          <div className="mt-4">
            <Link to="/thank-you" className="text-sm text-gold hover:underline">
              כבר יודעים שאתם רוצים את הסדרה המלאה? לצפייה בכל התוכניות ובתמחור
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-8 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 text-center text-xs text-muted-brown">
          © {new Date().getFullYear()} משרד עו״ד יפעת בן דוד עמית. כל הזכויות שמורות.
        </div>
      </footer>
    </div>
  );
}

function RegistrationForm({ sessionId }: { sessionId?: string }) {
  const savedContact = useRef(loadContact()).current;
  const [first_name, setFirstName] = useState(savedContact?.first_name ?? "");
  const [last_name, setLastName] = useState(savedContact?.last_name ?? "");
  const [email, setEmail] = useState(savedContact?.email ?? "");
  const [phone, setPhone] = useState(savedContact?.phone ?? "");
  const [firm_name, setFirmName] = useState(savedContact?.firm_name ?? "");
  const [bar_license, setBarLicense] = useState(savedContact?.bar_license ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    saveContact({ first_name, last_name, email, phone, firm_name, bar_license });
  }, [first_name, last_name, email, phone, firm_name, bar_license]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const parsed = RegSchema.safeParse({ first_name, last_name, email, phone, firm_name, bar_license });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (errs[i.path.join(".")] = i.message));
      setErrors(errs);
      toast.error("יש לתקן את השדות המסומנים");
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await subscribeRegistration({
        data: {
          first_name: parsed.data.first_name,
          last_name: parsed.data.last_name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          firm_name: parsed.data.firm_name || "",
          bar_license: parsed.data.bar_license || "",
          selected_packages: ["open"],
          session_id: sessionId,
        },
      });
      window.location.href = "/thank-you?registered=1";
    } catch (err) {
      console.error("[webinar] registration error", err);
      setServerError("אירעה תקלה בשליחת ההרשמה. אנא נסו שוב בעוד רגע.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass-gold rounded-2xl p-6 md:p-8 fade-rise">
      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <RegField label="שם פרטי" required value={first_name} onChange={setFirstName} error={errors.first_name} />
        <RegField label="שם משפחה" required value={last_name} onChange={setLastName} error={errors.last_name} />
        <RegField label="אימייל" type="email" required value={email} onChange={setEmail} error={errors.email} dir="ltr" />
        <RegField label="טלפון נייד" type="tel" required value={phone} onChange={setPhone} error={errors.phone} dir="ltr" />
        <RegField label="שם המשרד או חברה" value={firm_name} onChange={setFirmName} />
        <RegField label="מספר רישיון עריכת דין" value={bar_license} onChange={setBarLicense} dir="ltr" />
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
          <span className="relative z-10">{submitting ? "שולח..." : "הרשמה חינם לוובינר"}</span>
        </button>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 text-sm text-green-500">
        <MessageCircle size={16} className="fill-green-500/20" />
        <a
          href="https://chat.whatsapp.com/ENkngJp5Nb66DlhZ8gS4a0"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          הצטרפו לקבוצת הוואטסאפ שלנו
        </a>
      </div>
    </form>
  );
}

function RegField({
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
