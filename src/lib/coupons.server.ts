import { sql } from "./db.server";
import { sendRawEmail } from "./resend.server";
import { escapeHtml } from "./escape-html";
import { applyPlaceholders, getEmailOverrides } from "./email-content.server";

export const COUPON_INTRO_DEFAULT =
  "קיבלת קוד הנחה אישי של {percent}% על כל אחת מתוכניות ההמשך של IBDA.";

export type CouponRow = {
  id: string;
  code: string;
  discount_percent: number;
  registration_id: string | null;
  recipient_email: string | null;
  active: boolean;
  used_at: string | null;
  created_at: string;
};

export async function listCoupons(): Promise<CouponRow[]> {
  return sql()<CouponRow[]>`SELECT * FROM coupons ORDER BY created_at DESC`;
}

// Admin-created, reusable, no recipient attached.
export async function createGenericCoupon(
  code: string,
  discountPercent: number,
): Promise<CouponRow> {
  const rows = await sql()<CouponRow[]>`
    INSERT INTO coupons (code, discount_percent, registration_id, recipient_email)
    VALUES (${code.trim().toUpperCase()}, ${discountPercent}, NULL, NULL)
    RETURNING *
  `;
  return rows[0];
}

export async function setCouponActive(id: string, active: boolean): Promise<void> {
  await sql()`UPDATE coupons SET active = ${active} WHERE id = ${id}`;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `IBDA-${s}`;
}

// A single-use code tied to one lead, generated from their row in the admin
// leads table and emailed straight to them.
async function createCouponForRegistration(
  registrationId: string,
  email: string,
  discountPercent: number,
): Promise<CouponRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await sql()<CouponRow[]>`
      INSERT INTO coupons (code, discount_percent, registration_id, recipient_email)
      VALUES (${randomCode()}, ${discountPercent}, ${registrationId}, ${email.toLowerCase()})
      ON CONFLICT (code) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) return rows[0];
  }
  throw new Error("Failed to generate a unique coupon code");
}

// A single-use code sent directly to an email address that has no lead row
// yet — e.g. a prospect who called or emailed the office before ever
// submitting the site's registration form. Not linked to any registration.
async function createCouponForEmail(email: string, discountPercent: number): Promise<CouponRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await sql()<CouponRow[]>`
      INSERT INTO coupons (code, discount_percent, registration_id, recipient_email)
      VALUES (${randomCode()}, ${discountPercent}, NULL, ${email.toLowerCase()})
      ON CONFLICT (code) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) return rows[0];
  }
  throw new Error("Failed to generate a unique coupon code");
}

export async function getValidCoupon(
  code: string,
): Promise<{ code: string; discount_percent: number } | null> {
  const rows = await sql()<CouponRow[]>`
    SELECT * FROM coupons WHERE code = ${code.trim().toUpperCase()} AND active = true
  `;
  const coupon = rows[0];
  if (!coupon) return null;
  // Generic codes (no recipient) are reusable; personal codes are
  // single-use and stop validating once redeemed.
  if (coupon.recipient_email && coupon.used_at) return null;
  return { code: coupon.code, discount_percent: coupon.discount_percent };
}

// Only called once an order actually reaches 'paid' — a failed/cancelled
// charge must not burn a personal single-use code.
export async function markCouponUsed(code: string): Promise<void> {
  await sql()`
    UPDATE coupons SET used_at = now()
    WHERE code = ${code.trim().toUpperCase()} AND recipient_email IS NOT NULL AND used_at IS NULL
  `;
}

export function couponEmailHtml(
  greetingName: string | null,
  code: string,
  discountPercent: number,
  overrides: Record<string, string> = {},
): string {
  const greeting = greetingName ? `שלום ${escapeHtml(greetingName)},` : "שלום,";
  const introTemplate = overrides["coupon.intro"] ?? COUPON_INTRO_DEFAULT;
  const intro = applyPlaceholders(introTemplate, { percent: String(discountPercent) });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charSet="utf-8" /></head>
<body dir="rtl" style="margin:0;padding:0;background-color:#17150F;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" dir="rtl" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#17150F;padding:32px 16px;">
    <tr><td dir="rtl" align="center">
      <table role="presentation" dir="rtl" width="100%" style="max-width:560px;background-color:#211E16;border:1px solid #3A342A;border-radius:12px;overflow:hidden;">
        <tr><td dir="rtl" style="padding:28px 32px;color:#FFFDF7;">
          <h1 dir="rtl" style="color:#FFFDF7;font-size:22px;font-weight:400;margin:0 0 14px;">${greeting}</h1>
          <p dir="rtl" style="color:#D9D0BB;font-size:15px;line-height:1.8;margin:0 0 18px;">
            ${escapeHtml(intro)}
          </p>
          <div dir="rtl" style="background-color:#17150F;border:1px solid #C4A461;border-radius:8px;padding:16px 20px;margin-bottom:18px;text-align:center;">
            <span dir="rtl" style="color:#C4A461;font-size:22px;font-weight:700;letter-spacing:2px;">${code}</span>
          </div>
          <p dir="rtl" style="color:#D9D0BB;font-size:13px;line-height:1.7;">
            יש להזין את הקוד בעת ההרשמה לתשלום, בעמוד "כל התוכניות".
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendCouponEmailToRegistration(
  registrationId: string,
  discountPercent: number,
): Promise<{ code: string }> {
  const rows = await sql()<{ email: string; first_name: string }[]>`
    SELECT email, first_name FROM registrations WHERE id = ${registrationId}
  `;
  const registration = rows[0];
  if (!registration) throw new Error("Registration not found");

  const [coupon, overrides] = await Promise.all([
    createCouponForRegistration(registrationId, registration.email, discountPercent),
    getEmailOverrides(),
  ]);
  await sendRawEmail(
    registration.email,
    `קוד הנחה אישי בשווי ${discountPercent}% מ-IBDA`,
    couponEmailHtml(registration.first_name, coupon.code, discountPercent, overrides),
  );
  return { code: coupon.code };
}

// Sends a personal single-use coupon directly to an email address with no
// existing lead row — the admin's answer to "someone asked for a discount
// before ever filling out the site's form". `name` is optional and only
// used for the email greeting.
export async function sendCouponEmailToAddress(
  email: string,
  name: string | null,
  discountPercent: number,
): Promise<{ code: string }> {
  const [coupon, overrides] = await Promise.all([
    createCouponForEmail(email, discountPercent),
    getEmailOverrides(),
  ]);
  await sendRawEmail(
    email,
    `קוד הנחה אישי בשווי ${discountPercent}% מ-IBDA`,
    couponEmailHtml(name, coupon.code, discountPercent, overrides),
  );
  return { code: coupon.code };
}
