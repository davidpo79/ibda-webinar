import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Mail, AlertTriangle, ShieldAlert } from "lucide-react";
import { confirmSumitPayment } from "@/lib/sumit.functions";

export const Route = createFileRoute("/payment/success")({
  head: () => ({
    meta: [
      { title: "סטטוס תשלום · IBDA" },
      { name: "description", content: "סטטוס התשלום להרשמה לוובינרים של IBDA." },
    ],
  }),
  component: PaymentSuccessPage,
});

const SUPPORT_EMAIL = "webinar@ibda-law.com";

function parseSearch(): {
  statusCode: string | null;
  errorMessage: string | null;
  transactionId: string | null;
  orderReference: string | null;
  email: string | null;
  packageId: string | null;
} {
  if (typeof window === "undefined") {
    return {
      statusCode: null,
      errorMessage: null,
      transactionId: null,
      orderReference: null,
      email: null,
      packageId: null,
    };
  }
  const p = new URLSearchParams(window.location.search);
  return {
    statusCode: p.get("statusCode"),
    errorMessage: p.get("errorMessage") || p.get("message"),
    transactionId: p.get("transactionId") || p.get("TransactionID"),
    orderReference: p.get("order_reference") || p.get("orderReference") || p.get("orderRef"),
    email: p.get("email"),
    packageId: p.get("package"),
  };
}

function PaymentSuccessPage() {
  const [{ statusCode, errorMessage, transactionId, orderReference, email, packageId }, setState] =
    useState(parseSearch);

  useEffect(() => {
    setState(parseSearch());
  }, []);

  const success =
    statusCode === "0" || statusCode === null || statusCode?.toLowerCase() === "approved";

  useEffect(() => {
    document.title = success ? "התשלום התקבל · IBDA" : "התשלום נכשל · IBDA";
  }, [success]);

  // Fallback: guarantee the payment-status update lands even if the webhook missed.
  useEffect(() => {
    if (!success || !email || !transactionId) return;
    confirmSumitPayment({
      data: { transactionId, email, package_id: packageId || undefined },
    }).catch((err) => {
      console.error("[payment-success] confirm error", err);
    });
  }, [success, transactionId, email, packageId]);

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-background px-6 py-16"
      dir="rtl"
    >
      <div className="max-w-xl w-full">
        {success ? (
          <SuccessCard />
        ) : (
          <FailureCard errorMessage={errorMessage} statusCode={statusCode} />
        )}
      </div>
    </main>
  );
}

function SuccessCard() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-gold/15 flex items-center justify-center">
        <CheckCircle2 className="w-9 h-9 text-gold" />
      </div>

      <h1 className="font-serif text-4xl md:text-5xl text-cream mb-4">התשלום התקבל בהצלחה</h1>

      <p className="text-muted-brown text-lg mb-8 leading-relaxed">
        אנחנו מתרגשים שהצטרפת אלינו!
        <br />
        התשלום נקלט במערכת והמקום שלך שמור.
      </p>

      <div className="rounded-lg border border-gold/30 bg-gold/5 p-6 text-right mb-8">
        <div className="flex items-start gap-3 mb-3">
          <Mail className="w-5 h-5 text-gold shrink-0 mt-1" />
          <div>
            <h2 className="font-serif text-xl text-cream mb-1">השלב הבא - בדיקת המייל</h2>
            <p className="text-muted-brown leading-relaxed">
              בדקות הקרובות יישלח אליך מייל עם כל פרטי הוובינר: קישור הצפייה, מועדים, וחומרי הלימוד
              הנלווים.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 pt-3 border-t border-gold/20">
          <ShieldAlert className="w-5 h-5 text-gold shrink-0 mt-1" />
          <div>
            <h3 className="font-medium text-cream mb-1">אם המייל לא הגיע - בדקו בתיקיית הספאם</h3>
            <p className="text-muted-brown text-sm leading-relaxed">
              לעיתים המייל מסונן בטעות לתיקיית "דואר זבל" / "Spam" / "Promotions".&nbsp;
              <br />
              מומלץ לסמן את המייל כ"לא דואר זבל" כדי לוודא שתקבלו את כל העדכונים הבאים.
            </p>
          </div>
        </div>
      </div>

      <p className="text-muted-brown text-sm mb-6">
        שאלה או בעיה? כתבו לנו ל־
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold hover:underline mx-1">
          {SUPPORT_EMAIL}
        </a>
      </p>

      <Link
        to="/"
        className="inline-block px-6 py-3 rounded-md bg-gold text-background font-medium hover:opacity-90 transition"
      >
        חזרה לעמוד הבית
      </Link>
    </div>
  );
}

function FailureCard({
  errorMessage,
  statusCode,
}: {
  errorMessage: string | null | undefined;
  statusCode: string | null | undefined;
}) {
  const reason = reasonForCode(statusCode, errorMessage);

  return (
    <div className="text-center">
      <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
        <AlertTriangle className="w-9 h-9 text-red-400" />
      </div>

      <h1 className="font-serif text-4xl md:text-5xl text-cream mb-4">התשלום לא הושלם</h1>

      <p className="text-muted-brown text-lg mb-6 leading-relaxed">
        לא נרשם חיוב בכרטיס. הפרטים שמילאתם נשמרו ואפשר לנסות שוב.
      </p>

      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-right mb-8">
        <h2 className="font-serif text-lg text-cream mb-2">סיבת הכישלון</h2>
        <p className="text-muted-brown leading-relaxed">{reason}</p>
        {statusCode && <p className="text-muted-brown/70 text-xs mt-3">קוד שגיאה: {statusCode}</p>}
      </div>

      <div className="rounded-lg border border-gold/20 bg-gold/5 p-5 text-right mb-8">
        <h3 className="font-medium text-cream mb-2">צריכים עזרה?</h3>
        <p className="text-muted-brown text-sm leading-relaxed">
          צוות התמיכה שלנו כאן בשבילכם. כתבו לנו ל־
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=בעיה בתשלום`}
            className="text-gold hover:underline mx-1"
          >
            {SUPPORT_EMAIL}
          </a>
          ונחזור אליכם בהקדם.
        </p>
      </div>

      <div className="flex gap-3 justify-center">
        <Link
          to="/"
          className="inline-block px-6 py-3 rounded-md bg-gold text-background font-medium hover:opacity-90 transition"
        >
          חזרה ונסה שוב
        </Link>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=בעיה בתשלום`}
          className="inline-block px-6 py-3 rounded-md border border-gold/40 text-cream hover:bg-gold/10 transition"
        >
          פנייה לתמיכה
        </a>
      </div>
    </div>
  );
}

function reasonForCode(
  code: string | null | undefined,
  message: string | null | undefined,
): string {
  if (message) return message;
  switch (code) {
    case "1":
    case "2":
      return "הכרטיס נדחה על ידי חברת האשראי. מומלץ ליצור קשר עם חברת האשראי או לנסות בכרטיס אחר.";
    case "3":
      return "פרטי כרטיס האשראי שהוזנו שגויים. יש לבדוק את המספר, התוקף ו־CVV ולנסות שוב.";
    case "4":
      return "פג תוקף החיבור לעמוד התשלום. יש לבצע את התהליך מחדש.";
    case "5":
      return "העסקה בוטלה על ידי המשתמש לפני השלמת התשלום.";
    default:
      return "אירעה תקלה בתהליך התשלום. ייתכן שהעסקה נדחתה על ידי חברת האשראי, שהחיבור נותק, או שהעמוד נסגר לפני השלמת התהליך.";
  }
}
