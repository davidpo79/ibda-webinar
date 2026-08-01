import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { checkResetToken, completePasswordReset } from "@/lib/retainer.functions";

// Landing page for the emailed reset link. The token is validated in the
// loader so an expired or already-used link says so immediately, rather
// than after the user has typed a new password twice.
export const Route = createFileRoute("/partner/reset")({
  head: () => ({
    meta: [{ title: "איפוס סיסמה" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  validateSearch: z.object({ token: z.string().optional() }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    if (!deps.token) return { valid: false };
    try {
      return await checkResetToken({ data: { token: deps.token } });
    } catch {
      return { valid: false };
    }
  },
  component: ResetPage,
});

const inputCls =
  "w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-[15px] text-cream focus:outline-none focus:border-gold focus:bg-ink/60 transition-colors";

function ResetPage() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const { valid } = Route.useLoaderData();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (password !== confirm) {
      setError("הסיסמאות אינן תואמות");
      return;
    }
    setSubmitting(true);
    try {
      const res = await completePasswordReset({ data: { token: token!, password } });
      if (!res.ok) {
        setError("הקישור פג תוקף או כבר נוצל. יש לבקש קישור חדש.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch (err) {
      console.error("[partner/reset] error", err);
      setError("אירעה תקלה. נסו שוב.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-ink text-cream font-sans flex items-center justify-center px-6"
      dir="rtl"
    >
      {!valid ? (
        <div className="glass-gold rounded-2xl p-8 w-full max-w-sm fade-rise text-center">
          <p className="text-[14px] text-cream leading-relaxed">
            הקישור אינו תקף, פג תוקפו או שכבר נעשה בו שימוש.
          </p>
          <button
            onClick={() => navigate({ to: "/partner/login" })}
            className="mt-6 text-[13px] text-gold hover:underline"
          >
            חזרה למסך הכניסה
          </button>
        </div>
      ) : done ? (
        <div className="glass-gold rounded-2xl p-8 w-full max-w-sm fade-rise text-center">
          <p className="text-[14px] text-cream leading-relaxed">הסיסמה עודכנה בהצלחה.</p>
          <button
            onClick={() => navigate({ to: "/partner/login" })}
            className="btn-shimmer mt-6 w-full bg-gold text-ink py-3 rounded-md text-[15px] font-semibold hover:bg-gold-deep transition-all duration-300"
          >
            <span className="relative z-10">כניסה</span>
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="glass-gold rounded-2xl p-8 w-full max-w-sm fade-rise">
          <h1 className="font-serif text-lg text-gold mb-5 text-center">קביעת סיסמה חדשה</h1>

          <label className="block mb-5">
            <span className="text-sm font-semibold text-cream mb-2 block">סיסמה חדשה</span>
            <div className="relative">
              <input
                type={reveal ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                autoFocus
                autoComplete="new-password"
                className={`${inputCls} pl-10`}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-brown hover:text-gold transition-colors"
              >
                {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <span className="text-[11.5px] text-muted-brown/70 mt-1.5 block">לפחות 8 תווים</span>
          </label>

          <label className="block mb-5">
            <span className="text-sm font-semibold text-cream mb-2 block">אימות סיסמה</span>
            <input
              type={reveal ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              dir="ltr"
              autoComplete="new-password"
              className={inputCls}
            />
          </label>

          {error && <div className="mb-5 text-sm text-destructive">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-shimmer w-full bg-gold text-ink py-3 rounded-md text-[15px] font-semibold hover:bg-gold-deep transition-all duration-300 disabled:opacity-60"
          >
            <span className="relative z-10">{submitting ? "שומר..." : "שמירת סיסמה"}</span>
          </button>
        </form>
      )}
    </div>
  );
}
