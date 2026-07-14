import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { adminLogin } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "כניסת מנהל · IBDA" }],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminLogin({ data: { password } });
      if (!result.ok) {
        setError(
          "lockedOut" in result && result.lockedOut
            ? "יותר מדי ניסיונות התחברות כושלים. יש להמתין כ-15 דקות ולנסות שוב."
            : "סיסמה שגויה",
        );
        setSubmitting(false);
        return;
      }
      navigate({ to: "/admin" });
    } catch (err) {
      console.error("[admin/login] error", err);
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
        <h1 className="font-serif text-2xl text-shimmer mb-6 text-center">כניסת מנהל</h1>
        <label className="block mb-5">
          <span className="text-sm font-semibold text-cream mb-2 block">סיסמה</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
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
