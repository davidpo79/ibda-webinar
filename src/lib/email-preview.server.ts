import { resolvePackageSessions } from "./schedule.server";
import { buildWelcomeEmail, buildReminderEmail } from "./email-templates.server";
import { couponEmailHtml } from "./coupons.server";
import { priceNoticeEmailHtml } from "./pricing-notices.server";
import { paymentStatusEmailHtml } from "./resend.server";
import { getEmailOverrides, EDITABLE_PACKAGES } from "./email-content.server";

export type EmailPreview = { key: string; label: string; subject: string; html: string };

const SAMPLE_EMAIL = "example@example.com";
const SAMPLE_NAME = "ישראל";

// Renders every automated email the system can send, using the exact same
// builder functions the real send paths call — so what the admin sees here
// is guaranteed to match what actually goes out, not a hand-copied
// approximation. Session dates/Zoom links are the real current schedule
// data; only the recipient name/email are sample values.
export async function buildAllEmailPreviews(): Promise<EmailPreview[]> {
  const overrides = await getEmailOverrides();
  const previews: EmailPreview[] = [];

  for (const pkg of EDITABLE_PACKAGES) {
    const sessions =
      pkg.id === "core_single"
        ? await resolvePackageSessions("core_single", [1])
        : await resolvePackageSessions(pkg.id);

    const lessonTitle =
      pkg.id === "core_single" && sessions.kind === "single" ? sessions.session?.title : undefined;
    const welcome = buildWelcomeEmail(pkg.id, sessions, SAMPLE_EMAIL, { lessonTitle }, overrides);
    if (welcome) {
      previews.push({
        key: `welcome:${pkg.id}`,
        label: `ברוכים הבאים — ${pkg.label}`,
        subject: welcome.subject,
        html: welcome.html,
      });
    }

    const reminderSession = sessions.kind === "single" ? sessions.session : sessions.anchor;
    if (reminderSession) {
      const reminder = buildReminderEmail(
        pkg.id,
        SAMPLE_NAME,
        reminderSession,
        SAMPLE_EMAIL,
        overrides,
      );
      previews.push({
        key: `reminder:${pkg.id}`,
        label: `תזכורת — ${pkg.label}`,
        subject: reminder.subject,
        html: reminder.html,
      });
    }
  }

  const couponHtml = couponEmailHtml(SAMPLE_NAME, "IBDA-DEMO12", 15, overrides);
  previews.push({
    key: "coupon",
    label: "קוד הנחה אישי",
    subject: "קוד הנחה אישי בשווי 15% מ-IBDA",
    html: couponHtml,
  });

  const priceNoticeHtml = priceNoticeEmailHtml(
    SAMPLE_NAME,
    "חבילת פרימיום - הכל כלול",
    10,
    3720,
    overrides,
  );
  previews.push({
    key: "price_notice",
    label: "התראת עליית מחיר",
    subject: "המחיר של חבילת פרימיום - הכל כלול עולה בקרוב",
    html: priceNoticeHtml,
  });

  previews.push({
    key: "payment_status_paid",
    label: "אישור תשלום (גיבוי כללי)",
    subject: "התשלום שלך ל-IBDA התקבל בהצלחה",
    html: paymentStatusEmailHtml(true, overrides),
  });
  previews.push({
    key: "payment_status_failed",
    label: "כשל תשלום (גיבוי כללי)",
    subject: "התשלום שלך ל-IBDA לא הושלם",
    html: paymentStatusEmailHtml(false, overrides),
  });

  return previews;
}
