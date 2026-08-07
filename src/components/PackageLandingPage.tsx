import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Calendar, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ibdaLogo from "@/assets/ibda-logo.png";
import yifatPhoto from "@/assets/yifat.jpg";
import { subscribeRegistration } from "@/lib/resend.functions";
import { createSumitPayment } from "@/lib/sumit.functions";
import { saveContact, loadContact } from "@/lib/checkout-client";
import { idNumberSchema, phoneSchema } from "@/lib/validators";
import { VideoEmbed } from "@/components/VideoEmbed";
import { packageLabel } from "@/lib/meta";
import { trackLead, trackInitiateCheckout, useViewContent } from "@/lib/meta-client";

const RECORDING_VIDEO_ID = "QY_Mz_m4vhA";

export type PackageLandingConfig = {
  eyebrow: string;
  title: string;
  desc: string;
  topics: string[];
  packageId: string;
  coreSingleLessonIndex?: number;
  earlyPrice: number;
  regularPrice: number;
  risen: boolean;
  durationLabel: string;
};

export function PackageLandingPage({
  config,
  dateLabel,
}: {
  config: PackageLandingConfig;
  dateLabel: string;
}) {
  const priceNow = config.risen ? config.regularPrice : config.earlyPrice;
  useViewContent({
    content_ids: [config.packageId],
    content_name: packageLabel(config.packageId),
    value: priceNow,
  });

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
              {config.eyebrow}
            </span>
            <span className="w-10 h-px bg-gold" />
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl leading-tight text-shimmer mb-5">
            {config.title}
          </h1>
          <p className="text-muted-brown text-[17px] leading-[1.85] max-w-xl mx-auto mb-6">
            {config.desc}
          </p>
          <div className="flex flex-wrap items-center gap-3 justify-center">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-cream bg-gold/10 border border-gold/40 px-4 py-2 rounded-md">
              <Calendar size={16} className="text-gold" />
              <span>{dateLabel}</span>
              <span className="text-gold/50">·</span>
              <span>{config.durationLabel}</span>
            </div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-gold bg-gold/10 border border-gold/40 px-4 py-2 rounded-md">
              {!config.risen && (
                <span className="text-muted-brown ltr-inline text-[13px] line-through opacity-60">
                  ₪ {config.regularPrice.toLocaleString()}
                </span>
              )}
              <span className="ltr-inline">₪ {priceNow.toLocaleString()}</span>
            </div>
          </div>
          <p className="mt-4 text-[13px] text-gold/80 font-semibold">מספר המקומות מוגבל</p>
        </section>

        <section className="mb-12">
          <div className="bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg p-6 md:p-8">
            <h2 className="font-serif text-xl text-gold mb-4">צפו בהקלטה מהמפגש הפתוח</h2>
            <VideoEmbed videoId={RECORDING_VIDEO_ID} title="הקלטת המפגש הפתוח - IBDA" />
          </div>
        </section>

        <section className="mb-12">
          <div className="bg-sand/70 backdrop-blur-2xl border border-cream/10 rounded-lg p-6 md:p-8">
            <h2 className="font-serif text-xl text-gold mb-4">מה נלמד במפגש</h2>
            <ul className="space-y-4">
              {config.topics.map((topic, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-[18px] text-muted-brown leading-[1.75]"
                >
                  <span className="mt-3 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                  <span>{topic}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mb-8 flex items-center gap-6 justify-center">
          <div className="relative w-36 h-44 shrink-0">
            <div className="absolute inset-0 bg-sand rounded-sm ring-1 ring-gold/20" />
            <img
              src={yifatPhoto}
              alt="עו״ד יפעת בן דוד עמית"
              className="absolute inset-1 w-[calc(100%-0.5rem)] h-[calc(100%-0.5rem)] object-cover rounded-sm grayscale-[10%] mix-blend-luminosity opacity-95"
            />
          </div>
          <div className="text-right">
            <div className="text-xs tracking-[0.2em] uppercase text-gold ltr-inline">
              Instructor
            </div>
            <div className="font-serif text-2xl text-cream">עו״ד יפעת בן דוד עמית</div>
            <div className="text-base text-muted-brown">מייסדת משרד IBDA</div>
          </div>
        </section>

        <PurchaseForm config={config} priceNow={priceNow} />

        <div className="mt-10 text-center">
          <a
            href="mailto:webinar@ibda-law.com"
            className="text-sm text-muted-brown hover:text-gold transition-colors"
          >
            שאלות? webinar@ibda-law.com
          </a>
          <div className="mt-4">
            <Link to="/" className="text-base font-semibold text-gold hover:underline">
              רוצים ללמוד מאיתנו עוד? 😊
            </Link>
          </div>
          <div className="mt-3">
            <Link to="/thank-you" className="text-sm text-gold hover:underline">
              לצפייה בכל התוכניות ובתמחור המלא
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-8 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-center gap-4 text-xs text-muted-brown">
          <span>© {new Date().getFullYear()} משרד עו״ד יפעת בן דוד עמית. כל הזכויות שמורות.</span>
          <Link to="/accessibility" className="hover:text-gold transition-colors underline">
            הצהרת נגישות
          </Link>
        </div>
      </footer>
    </div>
  );
}

const RegSchema = z.object({
  first_name: z.string().trim().min(1, "יש להזין שם פרטי").max(100),
  last_name: z.string().trim().min(1, "יש להזין שם משפחה").max(100),
  email: z.string().trim().email("כתובת אימייל לא תקינה").max(255),
  phone: phoneSchema,
  firm_name: z.string().trim().max(120).optional().or(z.literal("")),
  bar_license: z.string().trim().max(20).optional().or(z.literal("")),
  id_number: idNumberSchema,
});

function PurchaseForm({ config, priceNow }: { config: PackageLandingConfig; priceNow: number }) {
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

  useEffect(() => {
    saveContact({ first_name, last_name, email, phone, firm_name, bar_license, id_number });
  }, [first_name, last_name, email, phone, firm_name, bar_license, id_number]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const parsed = RegSchema.safeParse({
      first_name,
      last_name,
      email,
      phone,
      firm_name,
      bar_license,
      id_number,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (errs[i.path.join(".")] = i.message));
      setErrors(errs);
      toast.error("יש לתקן את השדות המסומנים");
      return;
    }
    setErrors({});
    setSubmitting(true);

    const lessonIndexes = config.coreSingleLessonIndex ? [config.coreSingleLessonIndex] : undefined;
    try {
      await subscribeRegistration({
        data: {
          first_name: parsed.data.first_name,
          last_name: parsed.data.last_name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          firm_name: parsed.data.firm_name || "",
          bar_license: parsed.data.bar_license || "",
          selected_packages: [config.packageId],
          core_single_lesson_indexes: lessonIndexes,
        },
      });
    } catch (err) {
      console.error("[landing] subscribe error", err);
      setSubmitting(false);
      setServerError("אירעה תקלה בשליחת ההרשמה. אנא נסו שוב בעוד רגע.");
      return;
    }

    await trackLead({
      email: parsed.data.email,
      phone: parsed.data.phone,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      content_ids: [config.packageId],
      content_name: packageLabel(config.packageId),
      value: priceNow,
    });

    try {
      const orderRef = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await trackInitiateCheckout({
        email: parsed.data.email,
        phone: parsed.data.phone,
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        order_reference: orderRef,
        content_ids: [config.packageId],
        content_name: packageLabel(config.packageId),
        contents: [{ id: config.packageId, quantity: 1, item_price: priceNow }],
        num_items: 1,
        value: priceNow,
      });
      const { payment_url } = await createSumitPayment({
        data: {
          package_ids: [config.packageId],
          email: parsed.data.email,
          full_name: `${parsed.data.first_name} ${parsed.data.last_name}`.trim(),
          phone: parsed.data.phone,
          order_reference: orderRef,
          id_number: parsed.data.id_number,
          core_single_lesson_indexes: lessonIndexes,
        },
      });
      if (typeof window !== "undefined" && payment_url) {
        window.location.href = payment_url;
        return;
      }
    } catch (err) {
      console.error("[landing] Sumit payment error", err);
      setServerError("אירעה תקלה ביצירת דף התשלום. אנא נסו שוב או פנו אלינו.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} className="glass-gold rounded-2xl p-6 md:p-8 fade-rise">
      <h3 className="font-serif text-2xl text-cream text-center mb-6">השלמת הרכישה</h3>
      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <RegField
          label="שם פרטי"
          required
          value={first_name}
          onChange={setFirstName}
          error={errors.first_name}
        />
        <RegField
          label="שם משפחה"
          required
          value={last_name}
          onChange={setLastName}
          error={errors.last_name}
        />
        <RegField
          label="אימייל"
          type="email"
          required
          value={email}
          onChange={setEmail}
          error={errors.email}
          dir="ltr"
        />
        <RegField
          label="טלפון נייד"
          type="tel"
          required
          value={phone}
          onChange={setPhone}
          error={errors.phone}
          dir="ltr"
        />
        <RegField label="שם המשרד או חברה" value={firm_name} onChange={setFirmName} />
        <RegField
          label="מספר רישיון עריכת דין"
          value={bar_license}
          onChange={setBarLicense}
          dir="ltr"
        />
        <RegField
          label="מספר ת.ז / ח.פ (לצורך חשבונית)"
          required
          value={id_number}
          onChange={setIdNumber}
          error={errors.id_number}
          dir="ltr"
        />
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
            {submitting ? "מעביר לתשלום..." : `רכישה · ₪ ${priceNow.toLocaleString()}`}
          </span>
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
