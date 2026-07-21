import { Resend } from "resend";
import { sql } from "./db.server";
import { signUnsubscribeToken } from "./unsubscribe.server";
import { escapeHtml } from "./escape-html";
import ibdaLogo from "@/assets/ibda-logo.png";

function absoluteLogoUrl(): string {
  const origin = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return origin ? `${origin}${ibdaLogo}` : ibdaLogo;
}

export const BROADCAST_PACKAGE_LABELS: Record<string, string> = {
  open: "וובינר פתוח",
  core_full: "הסדרה המלאה",
  core_single: "וובינר בודד",
  premium_litigation: "סדנת ליטיגציה",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום",
};

export type BroadcastAudienceSource = "leads" | "buyers" | "all";

export type BroadcastRecipient = { email: string; name: string };

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

// "Leads" = everyone who ever submitted the registration form (selected_packages
// tags which product(s) they registered interest in); "buyers" = anyone with at
// least one paid order (package_id tags what they actually bought). A lead who
// later paid appears in both — the "all" source dedupes them into one row, kept
// under whichever source it was first seen from.
export async function resolveBroadcastAudience(
  source: BroadcastAudienceSource,
  packageIds: string[],
): Promise<BroadcastRecipient[]> {
  const recipients = new Map<string, BroadcastRecipient>();

  const nameRows = await sql()<{ email: string; first_name: string; created_at: string }[]>`
    SELECT email, first_name, created_at FROM registrations ORDER BY created_at DESC
  `;
  const nameByEmail = new Map<string, string>();
  for (const r of nameRows) {
    const key = r.email.trim().toLowerCase();
    if (key && !nameByEmail.has(key)) nameByEmail.set(key, r.first_name || "");
  }

  if (source === "leads" || source === "all") {
    const rows = await sql()<{ email: string; selected_packages: string[] }[]>`
      SELECT email, selected_packages FROM registrations
    `;
    for (const r of rows) {
      if (packageIds.length && !r.selected_packages.some((p) => packageIds.includes(p))) continue;
      const key = r.email.trim().toLowerCase();
      if (!key || recipients.has(key)) continue;
      recipients.set(key, { email: r.email.trim(), name: nameByEmail.get(key) ?? "" });
    }
  }

  if (source === "buyers" || source === "all") {
    const rows = await sql()<{ email: string; package_id: string }[]>`
      SELECT DISTINCT email, package_id FROM orders WHERE status = 'paid'
    `;
    const buyersByEmail = new Map<string, { originalEmail: string; packages: Set<string> }>();
    for (const r of rows) {
      const key = r.email.trim().toLowerCase();
      if (!key) continue;
      if (!buyersByEmail.has(key)) {
        buyersByEmail.set(key, { originalEmail: r.email.trim(), packages: new Set() });
      }
      buyersByEmail.get(key)!.packages.add(r.package_id);
    }
    for (const [key, buyer] of buyersByEmail) {
      if (packageIds.length && ![...buyer.packages].some((p) => packageIds.includes(p))) continue;
      if (recipients.has(key)) continue;
      recipients.set(key, { email: buyer.originalEmail, name: nameByEmail.get(key) ?? "" });
    }
  }

  return [...recipients.values()].sort((a, b) => a.email.localeCompare(b.email));
}

// Resend's plain Send/Batch API does not automatically suppress
// contacts.unsubscribed=true the way their Broadcast/Audience feature does —
// that's only enforced there. A broadcast built on our own recipient list
// must check this itself, or a one-click-unsubscribed recipient would keep
// getting emailed. One paginated list call instead of one lookup per
// recipient.
export async function getUnsubscribedEmailSet(): Promise<Set<string>> {
  const resend = resendClient();
  const unsubscribed = new Set<string>();
  let after: string | undefined;
  // Hard cap of 50 pages (≤5,000 contacts at the max page size) — a runaway-
  // loop backstop, not an expected ceiling for this app's actual list size.
  for (let page = 0; page < 50; page++) {
    const { data, error } = await resend.contacts.list({ limit: 100, ...(after ? { after } : {}) });
    if (error || !data) break;
    for (const c of data.data) {
      if (c.unsubscribed && c.email) unsubscribed.add(c.email.trim().toLowerCase());
    }
    if (!data.has_more || data.data.length === 0) break;
    after = data.data[data.data.length - 1].id;
  }
  return unsubscribed;
}

const CTA_COLOR = "#C4A461";

// Matches this app's existing dark/gold email shell (see emailShell in
// resend.server.ts) rather than the reference implementation's light theme,
// so a broadcast doesn't look like a different product than every other
// email this system sends.
export function wrapBroadcastHtml(
  bodyHtml: string,
  name: string,
  email: string,
  ctaText: string,
  ctaUrl: string,
): string {
  const personalized = bodyHtml.split("[שם]").join(escapeHtml(name || "שלום"));
  const unsubUrl = email
    ? `${process.env.PUBLIC_SITE_URL || ""}/api/public/unsubscribe?email=${encodeURIComponent(email)}&token=${signUnsubscribeToken(email)}`
    : "";

  const ctaHtml =
    ctaText.trim() && ctaUrl.trim()
      ? `<div dir="rtl" style="text-align:center;margin:24px 0 8px;">
           <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${CTA_COLOR};color:#17150F;font-weight:700;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none;">${escapeHtml(ctaText)}</a>
         </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charSet="utf-8" /></head>
<body dir="rtl" style="margin:0;padding:0;background-color:#17150F;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" dir="rtl" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#17150F;padding:32px 16px;">
    <tr><td dir="rtl" align="center">
      <table role="presentation" dir="rtl" width="100%" style="max-width:560px;background-color:#211E16;border:1px solid #3A342A;border-radius:12px;overflow:hidden;">
        <tr><td dir="rtl" style="padding:28px 32px 12px;text-align:center;border-bottom:1px solid #3A342A;">
          <img src="${absoluteLogoUrl()}" alt="IBDA" width="140" style="display:block;margin:0 auto;" />
          <div dir="rtl" style="color:#D9D0BB;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:8px;">Law Firm · Webinars</div>
        </td></tr>
        <tr><td dir="rtl" style="padding:28px 32px;color:#FFFDF7;font-size:15px;line-height:1.8;text-align:right;">
          ${personalized}
          ${ctaHtml}
        </td></tr>
        <tr><td dir="rtl" style="padding:18px 32px;border-top:1px solid #3A342A;text-align:center;">
          <span dir="rtl" style="color:#D9D0BB;font-size:12px;">שאלות? <a href="mailto:webinar@ibda-law.com" style="color:#C4A461;">webinar@ibda-law.com</a>${
            unsubUrl ? ` · <a href="${unsubUrl}" style="color:#8a8272;">הסרה מרשימת התפוצה</a>` : ""
          }</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export type BroadcastAttachment = { filename: string; contentBase64: string };

export async function sendBroadcastTest(input: {
  testEmail: string;
  subject: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  attachments: BroadcastAttachment[];
}): Promise<void> {
  const resend = resendClient();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: input.testEmail,
    replyTo: "webinar@ibda-law.com",
    subject: `[בדיקה] ${input.subject}`,
    html: wrapBroadcastHtml(input.bodyHtml, "", input.testEmail, input.ctaText, input.ctaUrl),
    attachments: input.attachments.map((a) => ({ filename: a.filename, content: a.contentBase64 })),
  });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
}

// Batch send (one API call per ≤50 recipients) is used when there are no
// attachments — Resend's batch endpoint doesn't support them at all
// (CreateBatchEmailOptions omits the field entirely), so a broadcast with
// files falls back to individual sequential sends instead, paced to stay
// under the plan's rate limit.
export async function sendBroadcastEmail(input: {
  source: BroadcastAudienceSource;
  packageIds: string[];
  subject: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  attachments: BroadcastAttachment[];
}): Promise<{ sent: number; failed: number; total: number; skippedUnsubscribed: number }> {
  const [audience, unsubscribed] = await Promise.all([
    resolveBroadcastAudience(input.source, input.packageIds),
    getUnsubscribedEmailSet(),
  ]);
  const recipients = audience.filter((r) => !unsubscribed.has(r.email.toLowerCase()));
  const skippedUnsubscribed = audience.length - recipients.length;

  const resend = resendClient();
  let sent = 0;
  let failed = 0;

  if (input.attachments.length === 0) {
    const BATCH = 50;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      try {
        const { error } = await resend.batch.send(
          batch.map((r) => ({
            from: fromAddress(),
            to: r.email,
            replyTo: "webinar@ibda-law.com",
            subject: input.subject,
            html: wrapBroadcastHtml(input.bodyHtml, r.name, r.email, input.ctaText, input.ctaUrl),
          })),
        );
        if (error) {
          failed += batch.length;
          console.error("[broadcast] batch send error", error);
        } else {
          sent += batch.length;
        }
      } catch (err) {
        failed += batch.length;
        console.error("[broadcast] batch send exception", err);
      }
    }
  } else {
    for (const r of recipients) {
      try {
        const { error } = await resend.emails.send({
          from: fromAddress(),
          to: r.email,
          replyTo: "webinar@ibda-law.com",
          subject: input.subject,
          html: wrapBroadcastHtml(input.bodyHtml, r.name, r.email, input.ctaText, input.ctaUrl),
          attachments: input.attachments.map((a) => ({
            filename: a.filename,
            content: a.contentBase64,
          })),
        });
        if (error) {
          failed++;
          console.error("[broadcast] send error", r.email, error);
        } else {
          sent++;
        }
      } catch (err) {
        failed++;
        console.error("[broadcast] send exception", r.email, err);
      }
      // Stay comfortably under Resend's default 2 req/s rate limit.
      await new Promise((resolve) => setTimeout(resolve, 550));
    }
  }

  return { sent, failed, total: recipients.length, skippedUnsubscribed };
}
