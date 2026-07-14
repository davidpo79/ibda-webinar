// Minimal HTML-escaping for user-supplied text (names, coupon codes, etc.)
// interpolated into email templates — these are transactional emails sent
// from the firm's own trusted domain, so unescaped input would let a
// registrant inject arbitrary markup/links into mail their own address (or
// anyone else's, since email delivery here isn't gated on proving inbox
// ownership) actually receives.
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
