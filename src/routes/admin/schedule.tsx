import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  getAdminScheduleData,
  updateSessionDateAction,
  updateSessionDateTbdAction,
  updateSessionZoomUrlAction,
  createOpenSessionAction,
  createSessionCohortAction,
} from "@/lib/admin.functions";
import type { Session } from "@/lib/schedule.server";
import {
  formatSessionDate,
  isoToIsraelDatetimeLocal,
  israelDatetimeLocalToISOString,
} from "@/lib/format-date";
import { cn } from "@/lib/utils";

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

type SessionGroup = { key: string; title: string; rows: Session[] };

// Groups sessions that share a lesson/workshop key (a key can now have
// several future cohort rows) so the admin edits/adds dates per lesson
// instead of per raw row.
function groupByKey(list: Session[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>();
  const order: string[] = [];
  for (const s of list) {
    const k = s.key ?? s.id;
    if (!map.has(k)) {
      map.set(k, { key: k, title: s.title, rows: [] });
      order.push(k);
    }
    map.get(k)!.rows.push(s);
  }
  return order.map((k) => {
    const g = map.get(k)!;
    g.rows.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    return g;
  });
}

function AdminSchedulePage() {
  const router = useRouter();
  const { sessions } = Route.useLoaderData();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dateError, setDateError] = useState<{ id: string; message: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [creating, setCreating] = useState(false);

  async function onDateChange(id: string, value: string) {
    if (!value) return;
    setSavingId(id);
    setDateError(null);
    try {
      await updateSessionDateAction({
        data: { id, startsAt: israelDatetimeLocalToISOString(value) },
      });
      await router.invalidate();
    } catch (err) {
      console.error("[admin/schedule] update failed", err);
      setDateError({ id, message: "עדכון המועד נכשל. נסו שוב." });
    } finally {
      setSavingId(null);
    }
  }

  async function onTbdChange(id: string, dateTbd: boolean) {
    setSavingId(id);
    setDateError(null);
    try {
      await updateSessionDateTbdAction({ data: { id, dateTbd } });
      await router.invalidate();
    } catch (err) {
      console.error("[admin/schedule] TBD toggle failed", err);
      setDateError({ id, message: "העדכון נכשל. נסו שוב." });
    } finally {
      setSavingId(null);
    }
  }

  async function onZoomChange(id: string, zoomUrl: string) {
    setSavingId(id);
    setDateError(null);
    try {
      await updateSessionZoomUrlAction({ data: { id, zoomUrl: zoomUrl || null } });
      await router.invalidate();
    } catch (err) {
      console.error("[admin/schedule] zoom url update failed", err);
      setDateError({ id, message: "עדכון קישור הזום נכשל. ודאו שהקישור מתחיל ב-https://" });
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

  const openSessions = sessions.filter((s) => s.type === "open");
  const coreGroups = groupByKey(sessions.filter((s) => s.type === "core"));
  const premiumGroups = groupByKey(sessions.filter((s) => s.type === "premium"));

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">עריכת מועדים</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה למסך הראשי
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-12">
        <section>
          <h2 className="font-serif text-lg text-gold mb-4">{TYPE_LABELS.open}</h2>
          <div className="hidden md:block border border-cream/10 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-sand/70 text-right">
                <tr>
                  <th className="px-4 py-3 font-semibold">כותרת</th>
                  <th className="px-4 py-3 font-semibold">מועד נוכחי</th>
                  <th className="px-4 py-3 font-semibold">שינוי מועד</th>
                  <th className="px-4 py-3 font-semibold">קישור זום</th>
                </tr>
              </thead>
              <tbody>
                {openSessions.map((s) => (
                  <tr key={s.id} className="border-t border-cream/10">
                    <td className="px-4 py-3">{s.title}</td>
                    <td className="px-4 py-3 text-muted-brown">{formatSessionDate(s.starts_at)}</td>
                    <td className="px-4 py-3">
                      <SessionDateInput
                        session={s}
                        savingId={savingId}
                        error={dateError}
                        onDateChange={onDateChange}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <SessionZoomInput
                        session={s}
                        savingId={savingId}
                        error={dateError}
                        onZoomChange={onZoomChange}
                      />
                    </td>
                  </tr>
                ))}
                {openSessions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-brown">
                      אין מפגשים
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {openSessions.map((s) => (
              <div key={s.id} className="border border-cream/10 rounded-lg p-4 bg-ink/20">
                <div className="font-medium text-cream">{s.title}</div>
                <div className="text-muted-brown text-sm mt-1">
                  מועד נוכחי: {formatSessionDate(s.starts_at)}
                </div>
                <div className="mt-3">
                  <SessionDateInput
                    session={s}
                    savingId={savingId}
                    error={dateError}
                    onDateChange={onDateChange}
                  />
                </div>
                <div className="mt-3">
                  <span className="text-xs text-muted-brown mb-1 block">קישור זום</span>
                  <SessionZoomInput
                    session={s}
                    savingId={savingId}
                    error={dateError}
                    onZoomChange={onZoomChange}
                  />
                </div>
              </div>
            ))}
            {openSessions.length === 0 && (
              <div className="border border-cream/10 rounded-lg px-4 py-6 text-center text-muted-brown text-sm">
                אין מפגשים
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="font-serif text-lg text-gold mb-4">{TYPE_LABELS.core}</h2>
          <GroupedScheduleList
            groups={coreGroups}
            savingId={savingId}
            dateError={dateError}
            onDateChange={onDateChange}
            onTbdChange={onTbdChange}
            onZoomChange={onZoomChange}
          />
        </section>

        <section>
          <h2 className="font-serif text-lg text-gold mb-4">{TYPE_LABELS.premium}</h2>
          <GroupedScheduleList
            groups={premiumGroups}
            savingId={savingId}
            dateError={dateError}
            onDateChange={onDateChange}
            onZoomChange={onZoomChange}
          />
        </section>

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

function GroupedScheduleList({
  groups,
  savingId,
  dateError,
  onDateChange,
  onTbdChange,
  onZoomChange,
}: {
  groups: SessionGroup[];
  savingId: string | null;
  dateError: { id: string; message: string } | null;
  onDateChange: (id: string, value: string) => void;
  onTbdChange?: (id: string, dateTbd: boolean) => void;
  onZoomChange: (id: string, zoomUrl: string) => void;
}) {
  const router = useRouter();

  if (groups.length === 0) {
    return (
      <div className="border border-cream/10 rounded-lg px-4 py-6 text-center text-muted-brown text-sm">
        אין מפגשים
      </div>
    );
  }

  return (
    <div className="border border-cream/10 rounded-lg divide-y divide-cream/10 overflow-hidden">
      {groups.map((g) => (
        <div key={g.key} className="px-4 py-4">
          <div className="font-medium text-cream mb-3">{g.title}</div>
          <div className="space-y-3">
            {g.rows.map((s) => (
              <div key={s.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <SessionDateInput
                    session={s}
                    savingId={savingId}
                    error={dateError}
                    onDateChange={onDateChange}
                  />
                  <span
                    className={cn(
                      "text-xs",
                      s.date_tbd ? "text-gold/70 line-through" : "text-muted-brown",
                    )}
                  >
                    {formatSessionDate(s.starts_at)}
                  </span>
                  {onTbdChange && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-brown cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-gold"
                        checked={s.date_tbd}
                        disabled={savingId === s.id}
                        onChange={(e) => onTbdChange(s.id, e.target.checked)}
                      />
                      בקרוב! (תאריך טרם נקבע)
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-brown shrink-0">קישור זום:</span>
                  <SessionZoomInput
                    session={s}
                    savingId={savingId}
                    error={dateError}
                    onZoomChange={onZoomChange}
                  />
                </div>
              </div>
            ))}
          </div>
          <AddCohortRow sessionKey={g.key} onAdded={() => router.invalidate()} />
        </div>
      ))}
    </div>
  );
}

// Shared date input for both the open-webinar table/cards and the grouped
// core/premium lists — skips saving when the value wasn't actually changed
// (avoids an unnecessary write from e.g. clicking in and tabbing back out),
// and surfaces a save failure inline instead of only logging it.
function SessionDateInput({
  session,
  savingId,
  error,
  onDateChange,
}: {
  session: Session;
  savingId: string | null;
  error: { id: string; message: string } | null;
  onDateChange: (id: string, value: string) => void;
}) {
  const initial = isoToIsraelDatetimeLocal(session.starts_at);
  return (
    <div>
      <input
        type="datetime-local"
        defaultValue={initial}
        onBlur={(e) => {
          if (e.target.value && e.target.value !== initial) {
            onDateChange(session.id, e.target.value);
          }
        }}
        disabled={savingId === session.id}
        className="bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold disabled:opacity-60"
      />
      {error?.id === session.id && <p className="text-destructive text-xs mt-1">{error.message}</p>}
    </div>
  );
}

// Shows the Zoom link currently saved for a session and lets the admin
// paste a new one — same skip-if-unchanged / inline-error pattern as
// SessionDateInput. A saved link also gets a quick "פתיחה" shortcut so the
// admin can confirm it points to the right meeting without leaving the page.
function SessionZoomInput({
  session,
  savingId,
  error,
  onZoomChange,
}: {
  session: Session;
  savingId: string | null;
  error: { id: string; message: string } | null;
  onZoomChange: (id: string, zoomUrl: string) => void;
}) {
  const initial = session.zoom_url ?? "";
  return (
    <div className="flex-1 min-w-[220px] max-w-md">
      <div className="flex items-center gap-2">
        <input
          type="url"
          dir="ltr"
          placeholder="https://zoom.us/j/..."
          defaultValue={initial}
          onBlur={(e) => {
            if (e.target.value.trim() !== initial) {
              onZoomChange(session.id, e.target.value.trim());
            }
          }}
          disabled={savingId === session.id}
          className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream ltr-inline focus:outline-none focus:border-gold disabled:opacity-60"
        />
        {initial && (
          <a
            href={initial}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gold hover:underline shrink-0"
          >
            פתיחה ↗
          </a>
        )}
      </div>
      {error?.id === session.id && <p className="text-destructive text-xs mt-1">{error.message}</p>}
    </div>
  );
}

function AddCohortRow({ sessionKey, onAdded }: { sessionKey: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function onAdd() {
    if (!date) return;
    setSaving(true);
    try {
      await createSessionCohortAction({
        data: { key: sessionKey, startsAt: israelDatetimeLocalToISOString(date) },
      });
      setDate("");
      setOpen(false);
      onAdded();
    } catch (err) {
      console.error("[admin/schedule] add cohort failed", err);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs text-gold hover:underline"
      >
        + הוספת מועד נוסף
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <input
        type="datetime-local"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold"
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={saving || !date}
        className="bg-gold text-ink px-4 py-2 rounded-md text-xs font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
      >
        {saving ? "מוסיף..." : "הוספה"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setDate("");
        }}
        className="text-xs text-muted-brown hover:text-cream"
      >
        ביטול
      </button>
    </div>
  );
}
