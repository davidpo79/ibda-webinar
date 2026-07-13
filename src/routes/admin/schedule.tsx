import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  getAdminScheduleData,
  updateSessionDateAction,
  createOpenSessionAction,
} from "@/lib/admin.functions";
import {
  formatSessionDate,
  isoToIsraelDatetimeLocal,
  israelDatetimeLocalToISOString,
} from "@/lib/format-date";

export const Route = createFileRoute("/admin/schedule")({
  head: () => ({
    meta: [{ title: "עריכת מועדים · אדמין · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminScheduleData();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminSchedulePage,
});

const TYPE_LABELS: Record<"open" | "core" | "premium", string> = {
  open: "וובינר פתוח",
  core: "סדרת הליבה",
  premium: "סדנאות פרימיום",
};

function AdminSchedulePage() {
  const router = useRouter();
  const { sessions } = Route.useLoaderData();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [creating, setCreating] = useState(false);

  async function onDateChange(id: string, value: string) {
    if (!value) return;
    setSavingId(id);
    try {
      await updateSessionDateAction({
        data: { id, startsAt: israelDatetimeLocalToISOString(value) },
      });
      await router.invalidate();
    } catch (err) {
      console.error("[admin/schedule] update failed", err);
    } finally {
      setSavingId(null);
    }
  }

  async function onCreateOpenSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) return;
    setCreating(true);
    try {
      await createOpenSessionAction({
        data: { title: newTitle.trim(), startsAt: israelDatetimeLocalToISOString(newDate) },
      });
      setNewTitle("");
      setNewDate("");
      await router.invalidate();
    } catch (err) {
      console.error("[admin/schedule] create failed", err);
    } finally {
      setCreating(false);
    }
  }

  const grouped = {
    open: sessions.filter((s) => s.type === "open"),
    core: sessions.filter((s) => s.type === "core"),
    premium: sessions.filter((s) => s.type === "premium"),
  };

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">עריכת מועדים</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה ללידים ולרוכשים
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-12">
        {(["open", "core", "premium"] as const).map((type) => (
          <section key={type}>
            <h2 className="font-serif text-lg text-gold mb-4">{TYPE_LABELS[type]}</h2>
            <div className="border border-cream/10 rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-sand/70 text-right">
                  <tr>
                    <th className="px-4 py-3 font-semibold">כותרת</th>
                    <th className="px-4 py-3 font-semibold">מועד נוכחי</th>
                    <th className="px-4 py-3 font-semibold">שינוי מועד</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[type].map((s) => (
                    <tr key={s.id} className="border-t border-cream/10">
                      <td className="px-4 py-3">{s.title}</td>
                      <td className="px-4 py-3 text-muted-brown">
                        {formatSessionDate(s.starts_at)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="datetime-local"
                          defaultValue={isoToIsraelDatetimeLocal(s.starts_at)}
                          onBlur={(e) => onDateChange(s.id, e.target.value)}
                          disabled={savingId === s.id}
                          className="bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold disabled:opacity-60"
                        />
                      </td>
                    </tr>
                  ))}
                  {grouped[type].length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-muted-brown">
                        אין מפגשים
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section>
          <h2 className="font-serif text-lg text-gold mb-4">הוספת מועד וובינר פתוח חדש</h2>
          <form
            onSubmit={onCreateOpenSession}
            className="glass-gold rounded-xl p-6 flex flex-wrap items-end gap-4"
          >
            <label className="block flex-1 min-w-[200px]">
              <span className="text-sm font-semibold text-cream mb-2 block">כותרת</span>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-cream mb-2 block">מועד</span>
              <input
                type="datetime-local"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="bg-ink/40 border border-cream/15 rounded-md px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="btn-shimmer bg-gold text-ink px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-gold-deep transition-all duration-300 disabled:opacity-60"
            >
              <span className="relative z-10">{creating ? "מוסיף..." : "הוספה"}</span>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
