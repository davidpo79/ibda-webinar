import { sql } from "./db.server";
import { getAllPackagePricing } from "./pricing.server";
import { listRegistrationsPendingPackage } from "./registrations.server";
import { sendRawEmail } from "./resend.server";
import { getEmailSendPolicy, isAllowedSendTime } from "./email-policy.server";
import { escapeHtml } from "./escape-html";
import { applyPlaceholders, getEmailOverrides } from "./email-content.server";

export const PRICE_NOTICE_INTRO_DEFAULT =
  'מחיר ההרשמה המוקדמת ל"{package}" עולה בעוד כ-{hours} שעות, למחיר של ₪{price}.';

const PACKAGE_TITLES: Record<string, string> = {
  core_single: "וובינר בודד מסדרת הליבה",
  core_full: "הסדרה המלאה - 9 מפגשים",
  premium_litigation: "סדנת ליטיגציה בנדל״ן",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום - הכל כלול",
};

function hoursUntil(cutoffIso: string): number {
  return Math.max(1, Math.round((new Date(cutoffIso).getTime() - Date.now()) / 3600000));
}

export function priceNoticeEmailHtml(
  firstName: string,
  packageTitle: string,
  hours: number,
  regularPrice: number,
  overrides: Record<string, string> = {},
): string {
  const introTemplate = overrides["price_notice.intro"] ?? PRICE_NOTICE_INTRO_DEFAULT;
  const intro = applyPlaceholders(introTemplate, {
    package: packageTitle,
    hours: String(hours),
    price: regularPrice.toLocaleString(),
  });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charSet="utf-8" /></head>
<body dir="rtl" style="margin:0;padding:0;background-color:#17150F;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" dir="rtl" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#17150F;padding:32px 16px;">
    <tr><td dir="rtl" align="center">
      <table role="presentation" dir="rtl" width="100%" style="max-width:560px;background-color:#211E16;border:1px solid #3A342A;border-radius:12px;overflow:hidden;">
        <tr><td dir="rtl" style="padding:28px 32px;color:#FFFDF7;">
          <h1 dir="rtl" style="color:#FFFDF7;font-size:22px;font-weight:400;margin:0 0 14px;">שלום ${escapeHtml(firstName)},</h1>
          <p dir="rtl" style="color:#D9D0BB;font-size:15px;line-height:1.8;margin:0 0 18px;">
            ${escapeHtml(intro)}
          </p>
          <p dir="rtl" style="color:#D9D0BB;font-size:14px;line-height:1.7;">
            אם עדיין לא השלמתם את ההרשמה, זה הזמן להשלים אותה במחיר הנוכחי.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Runs every sweep tick alongside the day-before reminders — for every
// package whose admin-configured price cutoff is within the next 12 hours
// and hasn't been notified yet, emails every lead who selected that package
// but hasn't already paid for it. Gated by the same admin-configured
// send-time policy as reminders (see src/lib/email-policy.server.ts): if
// sending isn't currently allowed, the whole sweep is skipped and retried
// next tick — nothing is marked notified until an email actually goes out.
export async function runPriceIncreaseNoticeSweep(): Promise<{ checked: number; sent: number }> {
  const policy = await getEmailSendPolicy();
  if (!isAllowedSendTime(new Date(), policy)) {
    return { checked: 0, sent: 0 };
  }

  const rows = await getAllPackagePricing();
  const now = Date.now();
  const due = rows.filter((r) => {
    if (!r.cutoff_at || r.price_increase_notified_at) return false;
    const msUntil = new Date(r.cutoff_at).getTime() - now;
    return msUntil > 0 && msUntil <= 12 * 60 * 60 * 1000;
  });

  const overrides = due.length ? await getEmailOverrides() : {};
  let sent = 0;
  for (const row of due) {
    const leads = await listRegistrationsPendingPackage(row.package_id);
    const hours = hoursUntil(row.cutoff_at!);
    const title = PACKAGE_TITLES[row.package_id] || row.package_id;
    for (const lead of leads) {
      try {
        await sendRawEmail(
          lead.email,
          `המחיר של ${title} עולה בקרוב`,
          priceNoticeEmailHtml(lead.first_name, title, hours, Number(row.regular_price), overrides),
        );
        sent++;
      } catch (err) {
        console.error("[pricing-notices] send failed", lead.email, row.package_id, err);
      }
    }
    await sql()`
      UPDATE package_pricing SET price_increase_notified_at = now() WHERE package_id = ${row.package_id}
    `;
  }

  return { checked: due.length, sent };
}
