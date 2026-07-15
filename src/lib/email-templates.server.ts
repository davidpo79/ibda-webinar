import type { Session, PackageSessions } from "./schedule.server";
import { formatHebrewFull, formatIsraelTime } from "./format-date";
import { signUnsubscribeToken } from "./unsubscribe.server";
import { escapeHtml } from "./escape-html";
import ibdaLogo from "@/assets/ibda-logo.png";
import yifatPhoto from "@/assets/yifat.jpg";

function siteOrigin(): string {
  return (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
}

function absoluteAsset(assetPath: string): string {
  const origin = siteOrigin();
  return origin ? `${origin}${assetPath}` : assetPath;
}

// dir="ltr" + unicode-bidi:isolate keeps the URL's own characters (/, ?, =,
// .) from being reordered by the bidi algorithm when this link sits inside
// an RTL paragraph — otherwise the displayed link text can render corrupted
// in RTL-aware mail clients (the underlying href is unaffected either way,
// but a garbled-looking link reads as broken/untrustworthy to the reader).
function goldLink(href: string, text: string): string {
  return `<a href="${href}" dir="ltr" style="color:#B26B00;text-decoration:underline;unicode-bidi:isolate;">${text}</a>`;
}

// White single-column shell matching the original ActiveCampaign/Stripo
// design documented in the email-automation spec — distinct from the dark
// ink/gold shell used by the site's own confirmation-of-form-submission
// email (src/lib/resend.server.ts), which follows the redesigned site's
// visual theme instead.
function marketingShell(bodyHtml: string, recipientEmail: string, preheader?: string): string {
  const logoUrl = absoluteAsset(ibdaLogo);
  const heroUrl = absoluteAsset(yifatPhoto);
  const origin = siteOrigin();
  const unsubUrl = origin
    ? `${origin}/api/public/unsubscribe?email=${encodeURIComponent(recipientEmail)}&token=${signUnsubscribeToken(recipientEmail)}`
    : "#";
  // Hidden preheader — the snippet most inbox list views show next to the
  // subject line. Without it, several packages purchased at once produce
  // emails that look identical in the inbox until opened (same subject
  // fallback, same blank preview), making it hard to tell which product
  // each one covers.
  const preheaderHtml = preheader
    ? `<span style="display:none;font-size:1px;color:#FFFFFF;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>`
    : "";
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body dir="rtl" style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Lucida Grande','Lucida Sans Unicode',Arial,sans-serif;">
  ${preheaderHtml}
  <table role="presentation" dir="rtl" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#FFFFFF;">
    <tr><td dir="rtl" align="center" style="padding:32px 16px;">
      <table role="presentation" dir="rtl" width="100%" style="max-width:560px;">
        <tr><td dir="rtl" align="center" style="padding-bottom:8px;">
          <img src="${logoUrl}" alt="IBDA" width="140" style="display:block;margin:0 auto;" />
          <div dir="rtl" style="color:#333333;font-size:12px;margin-top:6px;">בן דוד עמית | משרד עורכי דין</div>
        </td></tr>
        <tr><td dir="rtl" style="padding:22px 8px;color:#333333;font-size:15px;line-height:1.9;text-align:center;">
          ${bodyHtml}
        </td></tr>
        <tr><td dir="rtl" align="center" style="padding:12px 8px 8px;">
          <img src="${heroUrl}" alt="עו״ד יפעת בן דוד עמית" width="220" style="display:block;margin:0 auto;border-radius:4px;" />
        </td></tr>
        <tr><td dir="rtl" align="center" style="padding:20px 8px 4px;">
          <img src="${logoUrl}" alt="IBDA" width="110" style="display:block;margin:0 auto;" />
          <div dir="rtl" style="color:#333333;font-size:11px;margin-top:6px;">בן דוד עמית | משרד עורכי דין</div>
        </td></tr>
        <tr><td dir="rtl" align="center" style="padding:18px 8px 0;border-top:1px solid #eeeeee;">
          <div dir="rtl" style="color:#888888;font-size:11px;margin-top:14px;">Sent to: ${escapeHtml(recipientEmail)}</div>
          <div dir="rtl" style="margin-top:6px;">
            <a href="${unsubUrl}" style="color:#333333;font-size:11px;font-weight:bold;text-decoration:underline;">Unsubscribe</a>
          </div>
          <div dir="rtl" style="color:#aaaaaa;font-size:10px;margin-top:10px;">IBDA Law Firm | משרד עו״ד יפעת בן דוד עמית</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Distinct per package so a buyer who purchased several products at once
// can tell the emails apart in their inbox without opening each one — they
// previously all shared one identical subject line. Exported so the admin
// email-editing screen can show these as the fallback/default value for
// each package's editable subject field.
export const WELCOME_SUBJECT_BY_PACKAGE: Record<string, string> = {
  open: "ברוכים הבאים לוובינר הפתוח · IBDA",
  core_single: "ברוכים הבאים לוובינר שבחרת מסדרת הליבה · IBDA",
  core_full: "ברוכים הבאים לסדרת הליבה המלאה · IBDA",
  premium_bundle: "ברוכים הבאים לחבילת הפרימיום · IBDA",
  premium_partnership: "ברוכים הבאים לסדנת שיתוף במקרקעין · IBDA",
  premium_litigation: 'ברוכים הבאים לסדנת ליטיגציה בנדל"ן · IBDA',
  premium_registration: "ברוכים הבאים לסדנת רישום בית משותף · IBDA",
  premium_ai: "ברוכים הבאים לסדנת AI ואוטומציות · IBDA",
};

const WELCOME_PREHEADER: Record<string, string> = {
  open: "שמחים שהצטרפת אלינו לשלב א :)",
  core_single: "שמחים שהצטרפת אלינו לוובינר",
  core_full: "שמחים שהצטרפת אלינו לסדנת הליבה :)",
  premium_bundle: "שמחים שהצטרפת אלינו לחבילת הפרימיום :)",
  premium_partnership: "שמחים שהצטרפת אלינו לסדנא שיתוף במקרקעין",
  premium_litigation: 'שמחים שהצטרפת אלינו לסדנא ליטיגציה בנדל"ן',
  premium_registration: "שמחים שהצטרפת אלינו לסדנא רישום בית משותף",
  premium_ai: "שמחים שהצטרפת אלינו לסדנא העתיד כבר כאן",
};

export const WELCOME_INTRO: Record<string, string> = {
  open: "שמחים מאוד שהצטרפת אלינו לשלב א'",
  core_single: "שמחים מאוד שהצטרפת אלינו למפגשים שבחרת מסדרת הליבה",
  core_full: "שמחים מאוד שהצטרפת אלינו לסדנת הליבה",
  premium_bundle: "שמחים מאוד שהצטרפת אלינו לסדנת הליבה",
  premium_partnership: "שמחים מאוד שהצטרפת אלינו לסדנא שיתוף במקרקעין",
  premium_litigation: 'שמחים מאוד שהצטרפת אלינו לסדנא ליטיגציה בנדל"ן',
  premium_registration: "שמחים מאוד שהצטרפת אלינו לסדנא רישום בית משותף",
  premium_ai: "שמחים מאוד שהצטרפת אלינו לסדנא העתיד כבר כאן",
};

// "the next thing starting" phrasing in the reminder email — matches each
// package's own automation copy, grouped by the shape of what it refers to
// (a single free/paid webinar vs. a multi-session series vs. one workshop).
export const REMINDER_VERB: Record<string, string> = {
  open: "מתחיל הוובינר הראשון שלנו",
  core_single: "מתחיל הוובינר שלנו",
  core_full: "מתחילים בסדרת המפגשים שלנו",
  premium_bundle: "מתחילים בסדרת המפגשים שלנו",
  premium_partnership: "מתחילה הסדנא שלנו",
  premium_litigation: "מתחילה הסדנא שלנו",
  premium_registration: "מתחילה הסדנא שלנו",
  premium_ai: "מתחילה הסדנא שלנו",
};

// Packages whose welcome email lists several sessions (buildWelcomeEmail's
// "list" branch) rather than announcing one date — fixed by the package's
// own structure, not admin-configurable. Used only to pick the right
// default closing-line phrasing (singular "מפגש" vs plural "מפגשים") for
// the admin email-content editor; the actual send path still gets this from
// resolvePackageSessions's real kind.
const LIST_KIND_PACKAGES = new Set(["core_full", "premium_bundle"]);

// Every other previously-hardcoded line in the welcome/reminder emails,
// exposed the same way as WELCOME_INTRO/REMINDER_VERB above so the admin
// can edit them too — see src/routes/admin/emails.tsx.
export const WELCOME_TITLE_DEFAULT = 'ברוכים הבאים לתוכנית עסקאות נדל"ן וליטיגציה!';
export const WELCOME_PRESENTER_DEFAULT =
  "ואנחנו נרגשים לפתוח אותו יחד עם\nעורכת הדין והנוטריון יפעת בן דוד עמית";
export const WELCOME_CLOSING_DEFAULT: Record<string, string> = Object.fromEntries(
  Object.keys(WELCOME_INTRO).map((id) => [
    id,
    LIST_KIND_PACKAGES.has(id)
      ? "מצפים לנו מפגשים מרתקים, מחכים לך!"
      : "מצפה לנו מפגש מרתק, מחכים לך!",
  ]),
);
export const REMINDER_NOTICE_DEFAULT =
  "שים לב! כשאתה נכנס לזום ודא שהשם שלך מוצג בדיוק כפי שנרשמת באתר הוובינרים.";
export const REMINDER_CLOSING_DEFAULT = "מצפה לנו מפגש מרתק מחר, מחכים לך!";

// escapeHtml + preserve line breaks the admin typed (textarea newlines)
// as <br /> — lets the presenter line stay two lines without hardcoding a
// break the admin can't control. Exported so the admin email-editor's
// client-side live preview can apply the exact same transform when
// patching the already-rendered HTML (see src/routes/admin/emails.tsx).
export function escapeMultiline(text: string): string {
  return escapeHtml(text).split("\n").join("<br />");
}

function sessionLinkLabel(s: Session): string {
  // Core sessions carry their historical "מפגש N" numbering (sort_order 1-9);
  // premium workshops are listed by title alone.
  const prefix = s.type === "core" ? `מפגש ${s.sort_order} - ` : "";
  const dateLabel = formatHebrewFull(s.starts_at) || "";
  return `${prefix}${s.title} · ${dateLabel}`;
}

export type WelcomeEmail = { subject: string; preheader: string; html: string };

// Builds the immediate "welcome" email for a single package, using whatever
// session(s) that package currently resolves to (dates/links always read
// live from the sessions table, never hardcoded, so admin schedule edits
// are reflected automatically). Returns null for an unrecognized package_id.
export function buildWelcomeEmail(
  packageId: string,
  sessions: PackageSessions,
  recipientEmail: string,
  opts: { lessonTitle?: string } = {},
  overrides: Record<string, string> = {},
): WelcomeEmail | null {
  const preheader = WELCOME_PREHEADER[packageId];
  if (!preheader) return null;

  const title = escapeHtml(overrides["welcome.title"] ?? WELCOME_TITLE_DEFAULT);
  const presenter = escapeMultiline(overrides["welcome.presenter"] ?? WELCOME_PRESENTER_DEFAULT);
  const closing = escapeHtml(
    overrides[`welcome.${packageId}.closing`] ?? WELCOME_CLOSING_DEFAULT[packageId] ?? "",
  );

  let bodyInner: string;

  if (sessions.kind === "single") {
    const session = sessions.session;
    const dateLabel = session ? formatHebrewFull(session.starts_at) : "";
    const link = session?.zoom_url || "#";
    // core_single's intro always names the specific lesson the buyer
    // picked, computed at send time — not admin-editable text, since it
    // has to track whichever lesson was actually purchased.
    const intro =
      packageId === "core_single"
        ? `שמחים מאוד שהצטרפת אלינו לוובינר ${opts.lessonTitle || session?.title || ""}`
        : escapeHtml(overrides[`welcome.${packageId}.intro`] ?? WELCOME_INTRO[packageId]);
    bodyInner = `
      <p dir="rtl" style="margin:0 0 10px;">${intro}</p>
      <p dir="rtl" style="margin:0 0 10px;">המפגש שלנו ייצא לדרך ב${dateLabel}</p>
      <p dir="rtl" style="margin:0 0 18px;">${presenter}</p>
      <p dir="rtl" style="margin:0 0 18px;">קישור להצטרפות:<br />${goldLink(link, link)}</p>
      <p dir="rtl" style="margin:0;">${closing}</p>
    `;
  } else {
    const anchorLabel = sessions.anchor ? formatHebrewFull(sessions.anchor.starts_at) : "";
    // Names the actual earliest session in the package instead of assuming
    // it's always the AI workshop — an admin can reschedule any session to
    // be first, and this must track that rather than a hardcoded claim.
    const kickoffLine =
      packageId === "premium_bundle" && sessions.anchor
        ? `המפגש הראשון שלנו ייפתח בסדנת ${sessions.anchor.title}! ב${anchorLabel}`
        : `המפגש הראשון שלנו ייצא לדרך ב${anchorLabel}`;
    const linksHtml = sessions.sessions
      .slice()
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .map(
        (s) =>
          `<p dir="rtl" style="margin:8px 0;">${goldLink(s.zoom_url || "#", sessionLinkLabel(s))}</p>`,
      )
      .join("");
    const listIntro = escapeHtml(
      overrides[`welcome.${packageId}.intro`] ?? WELCOME_INTRO[packageId],
    );
    bodyInner = `
      <p dir="rtl" style="margin:0 0 10px;">${listIntro}</p>
      <p dir="rtl" style="margin:0 0 18px;">${kickoffLine}</p>
      <p dir="rtl" style="margin:0 0 10px;">${presenter}</p>
      <div dir="rtl" style="margin:0 0 18px;">${linksHtml}</div>
      <p dir="rtl" style="margin:0;">${closing}</p>
    `;
  }

  const html = marketingShell(
    `<h1 dir="rtl" style="font-size:20px;font-weight:bold;margin:0 0 18px;">${title}</h1>${bodyInner}`,
    recipientEmail,
    preheader,
  );

  const subject =
    overrides[`welcome.${packageId}.subject`] ??
    (WELCOME_SUBJECT_BY_PACKAGE[packageId] || WELCOME_SUBJECT_BY_PACKAGE.open);
  return { subject, preheader, html };
}

export type ReminderEmail = { subject: string; html: string };

// Builds the "day before" reminder email for a single package + session.
export function buildReminderEmail(
  packageId: string,
  firstName: string,
  session: Session,
  recipientEmail: string,
  overrides: Record<string, string> = {},
): ReminderEmail {
  const dateLabel = formatHebrewFull(session.starts_at);
  const hourLabel = formatIsraelTime(session.starts_at);
  const verb = escapeHtml(
    overrides[`reminder.${packageId}.verb`] ?? REMINDER_VERB[packageId] ?? "מתחיל המפגש שלנו",
  );
  const notice = escapeHtml(overrides["reminder.notice"] ?? REMINDER_NOTICE_DEFAULT);
  const closing = escapeHtml(overrides["reminder.closing"] ?? REMINDER_CLOSING_DEFAULT);
  const link = session.zoom_url || "#";
  const bodyInner = `
    <p dir="rtl" style="margin:0 0 14px;">שלום ${escapeHtml(firstName)}</p>
    <p dir="rtl" style="margin:0 0 14px;">🎉 מחר, ${dateLabel} ${verb}</p>
    <p dir="rtl" style="margin:0 0 14px;">${notice}</p>
    <p dir="rtl" style="margin:0 0 18px;">קישור להצטרפות:<br />${goldLink(link, link)}</p>
    <p dir="rtl" style="margin:0;">${closing}</p>
  `;
  const html = marketingShell(bodyInner, recipientEmail);
  return { subject: `תזכורת - מחר בשעה ${hourLabel} מתחילים!`, html };
}
