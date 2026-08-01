import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { partnerLogin, requestPasswordReset } from "@/lib/retainer.functions";

// Deliberately anonymous: no logo, no heading, no hint of what's behind it,
// and a neutral tab title. Anyone who lands here without credentials learns
// nothing about the page.
export const Route = createFileRoute("/partner/login")({
  head: () => ({
    meta: [{ title: "כניסה" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PartnerLoginPage,
});

const inputCls =
  "w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-[15px] text-cream focus:outline-none focus:border-gold focus:bg-ink/60 transition-colors";

function PartnerLoginPage() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  return (
    <div
      className="min-h-screen bg-ink text-cream font-sans flex items-center justify-center px-6"
      dir="rtl"
    >
      {mode === "login" ? (
        <LoginForm onForgot={() => setMode("forgot")} />
      ) : (
        <ForgotForm onBack={() => setMode("login")} />
      )}
    </div>
  );
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
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
    <form onSubmit={onSubmit} className="glass-gold rounded-2xl p-8 w-full max-w-sm fade-rise">
      <label className="block mb-5">
        <span className="text-sm font-semibold text-cream mb-2 block">שם משתמש</span>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          dir="ltr"
          autoFocus
          autoComplete="username"
          className={inputCls}
        />
      </label>

      <label className="block mb-5">
        <span className="text-sm font-semibold text-cream mb-2 block">סיסמה</span>
        <div className="relative">
          <input
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            autoComplete="current-password"
            className={`${inputCls} pl-10`}
          />
          {/* Sits on the left because the field itself is forced LTR, so
              that's the trailing edge of the text the user is typing. */}
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-brown hover:text-gold transition-colors"
          >
            {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>

      {error && <div className="mb-5 text-sm text-destructive">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="btn-shimmer w-full bg-gold text-ink py-3 rounded-md text-[15px] font-semibold hover:bg-gold-deep transition-all duration-300 disabled:opacity-60"
      >
        <span className="relative z-10">{submitting ? "מתחבר..." : "כניסה"}</span>
      </button>

      <button
        type="button"
        onClick={onForgot}
        className="mt-4 w-full text-center text-[12.5px] text-muted-brown hover:text-gold transition-colors"
      >
        שכחתי סיסמה
      </button>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestPasswordReset({ data: { username } });
    } catch (err) {
      console.error("[partner/forgot] error", err);
    }
    // Shown regardless of the outcome: confirming whether an account exists
    // would turn this form into a way to discover valid usernames.
    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <div className="glass-gold rounded-2xl p-8 w-full max-w-sm fade-rise text-center">
        <p className="text-[14px] text-cream leading-relaxed">
          אם החשבון קיים, נשלח אליו מייל עם קישור לאיפוס הסיסמה.
        </p>
        <p className="text-[12.5px] text-muted-brown mt-3 leading-relaxed">
          הקישור תקף ל-30 דקות. אם המייל לא הגיע, כדאי לבדוק גם בתיקיית הספאם.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 text-[13px] text-gold hover:underline"
        >
          חזרה למסך הכניסה
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="glass-gold rounded-2xl p-8 w-full max-w-sm fade-rise">
      <p className="text-[13.5px] text-muted-brown mb-5 leading-relaxed">
        הזינו את שם המשתמש ונשלח קישור לאיפוס סיסמה לכתובת המייל הרשומה.
      </p>
      <label className="block mb-5">
        <span className="text-sm font-semibold text-cream mb-2 block">שם משתמש</span>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          dir="ltr"
          autoFocus
          autoComplete="username"
          className={inputCls}
        />
      </label>
      <button
        type="submit"
        disabled={submitting || !username.trim()}
        className="btn-shimmer w-full bg-gold text-ink py-3 rounded-md text-[15px] font-semibold hover:bg-gold-deep transition-all duration-300 disabled:opacity-60"
      >
        <span className="relative z-10">{submitting ? "שולח..." : "שליחת קישור"}</span>
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 w-full text-center text-[12.5px] text-muted-brown hover:text-gold transition-colors"
      >
        חזרה
      </button>
    </form>
  );
}
