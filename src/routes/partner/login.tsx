import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { partnerLogin } from "@/lib/retainer.functions";

// Deliberately anonymous: no logo, no heading, no hint of what's behind it,
// and a neutral tab title. Anyone who lands here without credentials learns
// nothing about the page.
export const Route = createFileRoute("/partner/login")({
  head: () => ({
    meta: [{ title: "כניסה" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PartnerLoginPage,
});

function PartnerLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await partnerLogin({ data: { username, password } });
      if (!result.ok) {
        // One message for every failure mode, so the form never reveals
        // which usernames exist.
        setError(
          "lockedOut" in result && result.lockedOut
            ? "יותר מדי ניסיונות התחברות. יש להמתין כ-15 דקות ולנסות שוב."
            : "פרטי התחברות שגויים",
        );
        setSubmitting(false);
        return;
      }
      navigate({ to: "/partner" });
    } catch (err) {
      console.error("[partner/login] error", err);
      setError("אירעה תקלה. נסו שוב.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-ink text-cream font-sans flex items-center justify-center px-6"
      dir="rtl"
    >
      <form onSubmit={onSubmit} className="glass-gold rounded-2xl p-8 w-full max-w-sm fade-rise">
        <label className="block mb-5">
          <span className="text-sm font-semibold text-cream mb-2 block">שם משתמש</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            dir="ltr"
            autoFocus
            autoComplete="username"
            className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-[15px] text-cream focus:outline-none focus:border-gold focus:bg-ink/60 transition-colors"
          />
        </label>
        <label className="block mb-5">
          <span className="text-sm font-semibold text-cream mb-2 block">סיסמה</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            autoComplete="current-password"
            className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-[15px] text-cream focus:outline-none focus:border-gold focus:bg-ink/60 transition-colors"
          />
        </label>
        {error && <div className="mb-5 text-sm text-destructive">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="btn-shimmer w-full bg-gold text-ink py-3 rounded-md text-[15px] font-semibold hover:bg-gold-deep transition-all duration-300 disabled:opacity-60"
        >
          <span className="relative z-10">{submitting ? "מתחבר..." : "כניסה"}</span>
        </button>
      </form>
    </div>
  );
}
