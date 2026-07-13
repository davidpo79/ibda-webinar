import { Resend } from "resend";
import { resolvePackageSessions } from "./schedule.server";
import { findRecentRegistrationForPackage } from "./registrations.server";
import { buildWelcomeEmail } from "./email-templates.server";
import { scheduleReminder } from "./reminders.server";

export type RegistrationSubscription = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  firm_name?: string;
  bar_license?: string;
  selected_packages: string[];
  core_single_lesson?: string;
  core_single_lesson_index?: number;
};

const PACKAGE_LABELS: Record<string, string> = {
  open: "וובינר פתוח",
  core_full: "הסדרה המלאה · 9 מפגשים",
  premium_litigation: 'סדנת ליטיגציה בנדל"ן',
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום הכל כלול",
};

const FREE_PACKAGES = new Set(["open"]);

// Recap shown in the confirmation email when the "open" webinar is among the
// selected packages. No join link exists in the system yet — access details
// are sent separately, manually, closer to the session. The date is dynamic
// (sourced from the sessions table by the caller) — this title is the only
// hardcoded part left, since the open webinar's topic doesn't change.
const OPEN_WEBINAR_RECAP_TITLE = "כמה זה עולה לעשות עסקת נדל״ן?";

let _resend: Resend | undefined;
function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend is not configured (RESEND_API_KEY missing)");
  if (!_resend) _resend = new Resend(apiKey);
  return _resend;
}

function fromAddress() {
  return process.env.RESEND_FROM_EMAIL || "IBDA Webinars <webinar@ibda-law.com>";
}

// Used by src/lib/reminders.server.ts (and available for any other caller
// that just needs to send a pre-built email) so the Resend client/from
// address aren't duplicated per module.
export async function sendRawEmail(to: string, subject: string, html: string): Promise<void> {
  const resend = resendClient();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to,
    replyTo: "webinar@ibda-law.com",
    subject,
    html,
  });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
}

export async function markContactUnsubscribed(email: string): Promise<void> {
  const resend = resendClient();
  const { error } = await resend.contacts.update({
    email: email.toLowerCase(),
    unsubscribed: true,
  });
  if (error) throw new Error(`Resend unsubscribe failed: ${error.message}`);
}

function packageLabels(data: RegistrationSubscription): string[] {
  return data.selected_packages
    .map((id) => {
      if (id === "core_single" && data.core_single_lesson) {
        return `וובינר בודד — ${data.core_single_lesson}`;
      }
      return PACKAGE_LABELS[id];
    })
    .filter(Boolean) as string[];
}

const CONTACT_PROPERTY_KEYS = ["firm_name", "bar_license", "packages", "payment_status"] as const;

// Resend's contact properties (custom fields) must exist before a value can
// be set for them — create them once per process, ignoring "already exists"
// errors on every call after the first.
let propertiesEnsured = false;
async function ensureContactProperties() {
  if (propertiesEnsured) return;
  const resend = resendClient();
  await Promise.all(
    CONTACT_PROPERTY_KEYS.map((key) =>
      resend.contactProperties.create({ key, type: "string" }).catch(() => {}),
    ),
  );
  propertiesEnsured = true;
}

// Upserts the contact (global — no Audience needed, that's the deprecated
// legacy Resend model) with the registration detail as contact properties,
// replacing ActiveCampaign's custom fields.
async function upsertResendContact(data: RegistrationSubscription) {
  await ensureContactProperties();
  const resend = resendClient();
  const email = data.email.toLowerCase();
  const properties: Record<string, string> = {
    firm_name: data.firm_name || "",
    bar_license: data.bar_license || "",
    packages: packageLabels(data).join(", "),
    payment_status: data.selected_packages.some((p) => !FREE_PACKAGES.has(p))
      ? "ממתין לתשלום"
      : "הרשמה חינם",
  };

  const created = await resend.contacts.create({
    email,
    firstName: data.first_name,
    lastName: data.last_name,
    unsubscribed: false,
    properties,
  });

  if (created.error) {
    const updated = await resend.contacts.update({
      email,
      firstName: data.first_name,
      lastName: data.last_name,
      properties,
    });
    if (updated.error) {
      throw new Error(`Resend contact upsert failed: ${updated.error.message}`);
    }
  }
}

async function sendConfirmationEmail(
  data: RegistrationSubscription,
  openWebinarDateLabel: string | null,
) {
  const resend = resendClient();
  const labels = packageLabels(data);
  const hasPaid = data.selected_packages.some((p) => !FREE_PACKAGES.has(p));

  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: data.email,
    replyTo: "webinar@ibda-law.com",
    subject: hasPaid ? "ההרשמה שלך ל-IBDA התקבלה" : "ההרשמה לוובינר הפתוח של IBDA אושרה",
    html: confirmationEmailHtml({ ...data, labels, hasPaid, openWebinarDateLabel }),
  });
  if (error) {
    console.error("[resend] confirmation email failed", error);
  }
}

export async function syncResendContact(
  data: RegistrationSubscription,
  openWebinarDateLabel: string | null = null,
): Promise<void> {
  await upsertResendContact(data);
  await sendConfirmationEmail(data, openWebinarDateLabel);
}

// Finds the buyer's original registration (for their name + which core
// lesson they picked, if any), builds that package's real welcome email,
// sends it, and schedules its reminder. Returns false (falling back to the
// generic payment-status email) if no matching registration/session data
// can be found — should only happen for data recorded before this system
// existed.
async function sendPackageWelcomeAfterPayment(email: string, packageId: string): Promise<boolean> {
  const registration = await findRecentRegistrationForPackage(email, packageId);
  if (!registration) return false;

  const sessions = await resolvePackageSessions(packageId, registration.core_single_lesson_index);
  const lessonTitle =
    packageId === "core_single" && sessions.kind === "single" ? sessions.session?.title : undefined;
  const welcome = buildWelcomeEmail(packageId, sessions, email, { lessonTitle });
  if (!welcome) return false;

  const resend = resendClient();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: email,
    replyTo: "webinar@ibda-law.com",
    subject: welcome.subject,
    html: welcome.html,
  });
  if (error) {
    console.error("[resend] package welcome email failed", error);
    return false;
  }

  await scheduleReminder(registration.id, packageId, registration.core_single_lesson_index);
  return true;
}

// `packageId` lets a successful payment trigger that package's real welcome
// email (with its actual Zoom link) and schedule its reminder — replacing
// the old generic "payment received, details will follow" placeholder now
// that we have real content to send instead. Failure emails keep the
// simple generic notice (nothing package-specific to say there).
export async function updateResendPaymentStatusByEmail(
  email: string,
  status: "שולם" | "נכשל",
  packageId?: string,
): Promise<void> {
  try {
    const resend = resendClient();
    const paid = status === "שולם";

    const { error: updateError } = await resend.contacts.update({
      email: email.toLowerCase(),
      properties: { payment_status: status },
    });
    if (updateError) console.error("[resend] payment status property update failed", updateError);

    if (paid && packageId) {
      const sentRichWelcome = await sendPackageWelcomeAfterPayment(email, packageId);
      if (sentRichWelcome) return;
    }

    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: email,
      replyTo: "webinar@ibda-law.com",
      subject: paid ? "התשלום שלך ל-IBDA התקבל בהצלחה" : "התשלום שלך ל-IBDA לא הושלם",
      html: paymentStatusEmailHtml(paid),
    });
    if (error) console.error("[resend] payment status email failed", error);
  } catch (err) {
    console.error("[resend] updatePaymentStatus error", err);
  }
}

function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charSet="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#17150F;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#17150F;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background-color:#211E16;border:1px solid #3A342A;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px 32px 12px;text-align:center;border-bottom:1px solid #3A342A;">
          <span style="color:#C4A461;font-size:22px;letter-spacing:1px;">IBDA</span>
          <div style="color:#D9D0BB;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Law Firm · Webinars</div>
        </tr></td>
        <tr><td style="padding:28px 32px;color:#FFFDF7;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #3A342A;text-align:center;">
          <span style="color:#D9D0BB;font-size:12px;">שאלות? <a href="mailto:webinar@ibda-law.com" style="color:#C4A461;">webinar@ibda-law.com</a></span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function exploreProgramsCta(): string {
  const origin = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (!origin) return "";
  return `
    <div style="background-color:#17150F;border:1px solid #C4A461;border-radius:8px;padding:18px 20px;margin-bottom:18px;text-align:center;">
      <p style="color:#FFFDF7;font-size:14px;line-height:1.7;margin:0 0 14px;">
        מוזמנים גם להציץ בסדרת הליבה ובסדנאות הפרימיום — מחיר ההרשמה המוקדמת
        בתוקף ל-72 שעות מסיום הוובינר הפתוח.
      </p>
      <a href="${origin}/thank-you" style="display:inline-block;background-color:#C4A461;color:#17150F;font-size:14px;font-weight:700;text-decoration:none;padding:10px 24px;border-radius:6px;">
        לצפייה בכל התוכניות ובתמחור
      </a>
    </div>`;
}

function webinarRecapHtml(dateLabel: string | null): string {
  return `
    <div style="background-color:#17150F;border:1px solid #3A342A;border-radius:8px;padding:16px 20px;margin-bottom:18px;">
      <div style="color:#C4A461;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">פרטי הוובינר הפתוח</div>
      <p style="color:#FFFDF7;font-size:15px;margin:0 0 6px;">${OPEN_WEBINAR_RECAP_TITLE}</p>
      ${dateLabel ? `<p style="color:#D9D0BB;font-size:13px;margin:0 0 10px;">${dateLabel}</p>` : ""}
      <p style="color:#D9D0BB;font-size:13px;line-height:1.6;margin:0;">פרטי ההתחברות למפגש יישלחו אליך בנפרד, סמוך למועד.</p>
    </div>`;
}

function confirmationEmailHtml(
  input: RegistrationSubscription & {
    labels: string[];
    hasPaid: boolean;
    openWebinarDateLabel: string | null;
  },
): string {
  const itemsHtml = input.labels.map((l) => `<li style="margin-bottom:6px;">${l}</li>`).join("");
  const hasOpenWebinar = input.selected_packages.includes("open");
  return emailShell(`
    <h1 style="color:#FFFDF7;font-size:24px;font-weight:400;margin:0 0 14px;">שלום ${input.first_name},</h1>
    <p style="color:#D9D0BB;font-size:15px;line-height:1.8;margin:0 0 18px;">
      ${
        input.hasPaid
          ? "תודה שנרשמת! פרטי הגישה למפגשים יישלחו אליך בקרוב, לאחר השלמת התשלום."
          : "ההרשמה שלך לוובינר הפתוח התקבלה בהצלחה. נתראה שם!"
      }
    </p>
    ${hasOpenWebinar ? webinarRecapHtml(input.openWebinarDateLabel) : ""}
    <div style="background-color:#17150F;border:1px solid #3A342A;border-radius:8px;padding:16px 20px;margin-bottom:18px;">
      <div style="color:#C4A461;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">מסלולים שנבחרו</div>
      <ul style="color:#FFFDF7;font-size:14px;margin:0;padding-inline-start:18px;">${itemsHtml}</ul>
    </div>
    ${input.hasPaid ? "" : exploreProgramsCta()}
    <p style="color:#D9D0BB;font-size:13px;line-height:1.7;">
      אם המייל לא מגיע לתיבה הראשית בהמשך, כדאי לבדוק בתיקיית הספאם/דואר זבל ולסמן אותנו כ"לא ספאם".
    </p>
  `);
}

function paymentStatusEmailHtml(paid: boolean): string {
  return emailShell(
    paid
      ? `<h1 style="color:#FFFDF7;font-size:24px;font-weight:400;margin:0 0 14px;">התשלום התקבל בהצלחה</h1>
         <p style="color:#D9D0BB;font-size:15px;line-height:1.8;">המקום שלך שמור. פרטי הוובינר יישלחו בהמשך לכתובת המייל הזו.</p>`
      : `<h1 style="color:#FFFDF7;font-size:24px;font-weight:400;margin:0 0 14px;">התשלום לא הושלם</h1>
         <p style="color:#D9D0BB;font-size:15px;line-height:1.8;">לא נרשם חיוב בכרטיס. אפשר לנסות שוב מדף ההרשמה, או לפנות אלינו לעזרה.</p>`,
  );
}
