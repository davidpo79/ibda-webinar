import { Resend } from "resend";
import { resolvePackageSessions } from "./schedule.server";
import { findRecentRegistrationForPackage } from "./registrations.server";
import { buildWelcomeEmail } from "./email-templates.server";
import { scheduleReminder } from "./reminders.server";
import { getEmailOverrides } from "./email-content.server";
import { escapeHtml } from "./escape-html";

export const PAYMENT_STATUS_PAID_DEFAULT = {
  title: "התשלום התקבל בהצלחה",
  body: "המקום שלך שמור. פרטי הוובינר יישלחו בהמשך לכתובת המייל הזו.",
};
export const PAYMENT_STATUS_FAILED_DEFAULT = {
  title: "התשלום לא הושלם",
  body: "לא נרשם חיוב בכרטיס. אפשר לנסות שוב מדף ההרשמה, או לפנות אלינו לעזרה.",
};

export type RegistrationSubscription = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  firm_name?: string;
  bar_license?: string;
  selected_packages: string[];
  core_single_lesson?: string;
  core_single_lesson_indexes?: number[];
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
        return `וובינר בודד: ${data.core_single_lesson}`;
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

// Only upserts the contact — no separate generic "registration received"
// email is sent here. Each package's own styled welcome email (open webinar:
// sent immediately after this; paid packages: sent once payment confirms —
// see updateResendPaymentStatusByEmail) is the single confirmation the
// visitor gets, so they never receive two different-looking emails for the
// same submission.
export async function syncResendContact(data: RegistrationSubscription): Promise<void> {
  await upsertResendContact(data);
}

// Finds the buyer's original registration (for their name + which core
// lesson they picked, if any), builds that package's real welcome email,
// sends it, and schedules its reminder. Returns false (falling back to the
// generic payment-status email) if no matching registration/session data
// can be found — should only happen for data recorded before this system
// existed.
async function sendPackageWelcomeAfterPayment(
  email: string,
  packageId: string,
  overrides: Record<string, string>,
): Promise<boolean> {
  const registration = await findRecentRegistrationForPackage(email, packageId);
  if (!registration) return false;

  const sessions = await resolvePackageSessions(packageId, registration.core_single_lesson_indexes);
  const lessonTitle =
    packageId === "core_single" && sessions.kind === "single" ? sessions.session?.title : undefined;
  const welcome = buildWelcomeEmail(packageId, sessions, email, { lessonTitle }, overrides);
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

  await scheduleReminder(registration.id, packageId, registration.core_single_lesson_indexes);
  return true;
}

// `packageIds` lets a successful payment trigger each purchased package's
// real welcome email (with its actual Zoom link) and schedule its reminder —
// replacing the old generic "payment received, details will follow"
// placeholder now that we have real content to send instead. A purchase can
// cover several packages at once, so every id gets its own welcome +
// reminder. Failure emails keep the simple generic notice (nothing
// package-specific to say there).
export async function updateResendPaymentStatusByEmail(
  email: string,
  status: "שולם" | "נכשל",
  packageIds: string[] = [],
): Promise<void> {
  try {
    const resend = resendClient();
    const paid = status === "שולם";

    const { error: updateError } = await resend.contacts.update({
      email: email.toLowerCase(),
      properties: { payment_status: status },
    });
    if (updateError) console.error("[resend] payment status property update failed", updateError);

    const overrides = await getEmailOverrides();

    if (paid && packageIds.length) {
      // Sequential, not Promise.all — firing several resend.emails.send calls
      // concurrently risked one getting silently rate-limited/dropped, which
      // showed up as "only got the email for the first product I bought".
      // Each iteration is also individually try/caught — an exception from
      // one package (e.g. a transient DB error in resolvePackageSessions)
      // must not abort the remaining packages' emails, or that reproduces
      // the same "missing emails for products after the first" symptom via
      // a different code path.
      const sent: boolean[] = [];
      for (const id of packageIds) {
        try {
          sent.push(await sendPackageWelcomeAfterPayment(email, id, overrides));
        } catch (err) {
          console.error("[resend] package welcome email failed", email, id, err);
          sent.push(false);
        }
      }
      if (sent.some(Boolean)) return;
    }

    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: email,
      replyTo: "webinar@ibda-law.com",
      subject: paid ? "התשלום שלך ל-IBDA התקבל בהצלחה" : "התשלום שלך ל-IBDA לא הושלם",
      html: paymentStatusEmailHtml(paid, overrides),
    });
    if (error) console.error("[resend] payment status email failed", error);
  } catch (err) {
    console.error("[resend] updatePaymentStatus error", err);
  }
}

// Email clients (Gmail's mobile app especially) don't reliably inherit
// dir="rtl" from <html> into nested table cells — bidi punctuation ends up
// misplaced unless every element carries its own explicit dir attribute.
function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charSet="utf-8" /></head>
<body dir="rtl" style="margin:0;padding:0;background-color:#17150F;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" dir="rtl" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#17150F;padding:32px 16px;">
    <tr><td dir="rtl" align="center">
      <table role="presentation" dir="rtl" width="100%" style="max-width:560px;background-color:#211E16;border:1px solid #3A342A;border-radius:12px;overflow:hidden;">
        <tr><td dir="rtl" style="padding:28px 32px 12px;text-align:center;border-bottom:1px solid #3A342A;">
          <span dir="rtl" style="color:#C4A461;font-size:22px;letter-spacing:1px;">IBDA</span>
          <div dir="rtl" style="color:#D9D0BB;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Law Firm · Webinars</div>
        </tr></td>
        <tr><td dir="rtl" style="padding:28px 32px;color:#FFFDF7;">
          ${bodyHtml}
        </td></tr>
        <tr><td dir="rtl" style="padding:18px 32px;border-top:1px solid #3A342A;text-align:center;">
          <span dir="rtl" style="color:#D9D0BB;font-size:12px;">שאלות? <a href="mailto:webinar@ibda-law.com" style="color:#C4A461;">webinar@ibda-law.com</a></span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function paymentStatusEmailHtml(
  paid: boolean,
  overrides: Record<string, string> = {},
): string {
  const defaults = paid ? PAYMENT_STATUS_PAID_DEFAULT : PAYMENT_STATUS_FAILED_DEFAULT;
  const prefix = paid ? "payment_status.paid" : "payment_status.failed";
  const title = overrides[`${prefix}.title`] ?? defaults.title;
  const body = overrides[`${prefix}.body`] ?? defaults.body;
  return emailShell(
    `<h1 dir="rtl" style="color:#FFFDF7;font-size:24px;font-weight:400;margin:0 0 14px;">${escapeHtml(title)}</h1>
     <p dir="rtl" style="color:#D9D0BB;font-size:15px;line-height:1.8;">${escapeHtml(body)}</p>`,
  );
}
