import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  getPartnerDashboard,
  partnerLogout,
  createEntryAction,
  updateEntryAction,
  deleteEntryAction,
  createPaymentAction,
  deletePaymentAction,
  updateConfigAction,
  sendDigestNowAction,
} from "@/lib/retainer.functions";
import type { RetainerEntryRow, RetainerPaymentRow } from "@/lib/retainer.server";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/partner/")({
  head: () => ({
    meta: [{ title: "בנק שעות" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  loader: async () => {
    try {
      return await getPartnerDashboard();
    } catch {
      throw redirect({ to: "/partner/login" });
    }
  },
  component: PartnerPage,
});

/* -------------------------- formatting -------------------------- */

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function money(n: number): string {
  return ILS.format(Math.round(n));
}

// Exact to two decimals, never padded past what the value actually holds.
// Fixing this at one decimal would make the rows visibly fail to add up to
// the total (1.75 shown as 1.8), which is corrosive on a page whose whole
// job is that the numbers can be trusted.
const HOURS_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function hours(n: number): string {
  return HOURS_FMT.format(n);
}

// "31.07" — matches the compact date style used across the admin screens.
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  return new Intl.DateTimeFormat("he-IL", { month: "long", timeZone: "UTC" }).format(d);
}

// yyyy-mm-dd in Israel time, for prefilling the date inputs.
function todayInIsrael(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return p;
}

/* -------------------------- page -------------------------- */

function PartnerPage() {
  const router = useRouter();
  const { user, config, entries, payments, summary } = Route.useLoaderData();
  const isEditor = user.role === "editor";
  const [showExplain, setShowExplain] = useState(false);

  const refresh = () => router.invalidate();

  async function onLogout() {
    await partnerLogout({ data: undefined });
    router.navigate({ to: "/partner/login" });
  }

  // Running balance: how much of the bank was left immediately after each
  // entry. Computed newest-first, so it starts at the current remaining
  // figure and adds each row's hours back as it walks into the past.
  const balances = new Map<string, number>();
  let running = summary.totalHours - summary.hoursUsed;
  for (const e of entries) {
    balances.set(e.id, running);
    running += Number(e.hours);
  }

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-5 md:px-8 py-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-lg md:text-xl text-gold">בנק שעות</h1>
          {summary.lastActivityAt && (
            <div className="text-[11.5px] text-muted-brown/70 mt-0.5">
              עודכן לאחרונה: {stamp(summary.lastActivityAt)}
            </div>
          )}
        </div>
        <div className="text-left shrink-0">
          <button
            onClick={onLogout}
            className="text-[12.5px] text-muted-brown hover:text-gold transition-colors"
          >
            יציאה
          </button>
          <div className="text-[13px] font-semibold text-cream mt-0.5">
            שלום, {user.displayName}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col gap-5 md:gap-6">
        <BankMeter summary={summary} onToggleExplain={() => setShowExplain((v) => !v)} />
        {showExplain && <Explainer />}
        <Tiles summary={summary} />
        {summary.monthly.length > 0 && <Pace monthly={summary.monthly} />}
        <WorkLog
          entries={entries}
          balances={balances}
          isEditor={isEditor}
          totalHours={summary.hoursUsed}
          onChanged={refresh}
        />
        <Payments payments={payments} summary={summary} isEditor={isEditor} onChanged={refresh} />
        {isEditor && (
          <div className="flex flex-wrap items-center gap-4">
            {config && (
              <BankSettings
                totalHours={Number(config.total_hours)}
                totalAmount={Number(config.total_amount)}
                onChanged={refresh}
              />
            )}
            <SendDigestButton />
          </div>
        )}
      </main>
    </div>
  );
}

/* -------------------------- summary -------------------------- */

type Summary = ReturnType<typeof Route.useLoaderData>["summary"];

function BankMeter({
  summary,
  onToggleExplain,
}: {
  summary: Summary;
  onToggleExplain: () => void;
}) {
  const over = summary.overageHours > 0;
  return (
    <section
      className={cn(
        "rounded-xl border p-5 md:p-6",
        over ? "border-destructive/40 bg-destructive/5" : "border-gold/30 bg-gold/[0.05]",
      )}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3.5">
        <div className="text-[15px] md:text-xl font-semibold">
          נוצלו{" "}
          <b className="text-gold text-[22px] md:text-3xl tabular-nums">
            {hours(summary.hoursUsed)}
          </b>{" "}
          מתוך <span className="tabular-nums">{hours(summary.totalHours)}</span> שעות
        </div>
        <div
          className={cn(
            "text-xl md:text-2xl font-bold tabular-nums shrink-0",
            over ? "text-destructive" : "text-gold",
          )}
        >
          {Math.round(summary.percentUsed)}%
        </div>
      </div>

      <div className="h-4 rounded-full bg-cream/[0.07] border border-cream/5 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            over
              ? "bg-destructive"
              : "bg-gradient-to-l from-gold-deep to-gold btn-shimmer relative overflow-hidden",
          )}
          style={{ width: `${Math.max(summary.percentUsed, 1.5)}%` }}
        />
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-3.5">
        <div className="text-[13.5px] md:text-[14.5px] text-muted-brown">
          נותרו <b className="text-cream tabular-nums">{hours(summary.hoursRemaining)}</b> שעות בבנק
          {over && (
            <span className="text-destructive font-semibold">
              {" "}
              · חריגה של {hours(summary.overageHours)} שעות
            </span>
          )}
        </div>
        <button
          onClick={onToggleExplain}
          className="text-[12.5px] text-gold hover:underline underline-offset-4 self-start"
        >
          ⓘ איך נמדדות השעות?
        </button>
      </div>
    </section>
  );
}

function Explainer() {
  return (
    <section className="rounded-lg border border-gold/20 border-r-[3px] border-r-gold bg-gold/[0.045] p-4 md:p-5 fade-rise">
      <h2 className="font-serif text-[13.5px] text-gold mb-2">איך נמדדות השעות</h2>
      <p className="text-[13px] text-muted-brown leading-[1.8] mb-2">
        המדידה אוטומטית ומתבצעת מתוך סשני העבודה עצמם,{" "}
        <b className="text-cream font-semibold">בניכוי זמני ההמתנה</b>. כלומר נספר זמן העבודה נטו
        בפועל בלבד: ניהול הפרויקט, ארכיטקטורה, תשתיות, פיתוח, עריכה ובדיקות. פסקי זמן ארוכים אינם
        נספרים כלל.
      </p>
      <p className="text-[13px] text-muted-brown leading-[1.8]">
        עבודה שמתבצעת מחוץ לסביבת הפיתוח, כגון פגישות ושיחות, מוזנת ידנית ומסומנת בטבלה כ״ידני״.
      </p>
    </section>
  );
}

function Tiles({ summary }: { summary: Summary }) {
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile
        label="שעות שנוצלו"
        value={hours(summary.hoursUsed)}
        foot={`מתוך ${hours(summary.totalHours)} שעות`}
      />
      <Tile
        label="שעות שנותרו"
        value={hours(summary.hoursRemaining)}
        foot={`${Math.round(100 - summary.percentUsed)}% מהבנק`}
        gold
      />
      <Tile
        label="שווי שנוצל"
        value={money(summary.valueUsed)}
        foot={`לפי ${money(summary.hourlyRate)} לשעה`}
        ltr
      />
      <Tile
        label="שולם בפועל"
        value={money(summary.paidTotal)}
        foot={`מתוך ${money(summary.totalAmount)} · נותר ${money(summary.paidRemaining)}`}
        ltr
      />
    </section>
  );
}

function Tile({
  label,
  value,
  foot,
  gold,
  ltr,
}: {
  label: string;
  value: string;
  foot: string;
  gold?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className="rounded-xl border border-cream/10 bg-sand-warm/[0.18] p-4">
      <div className="text-[11.5px] text-muted-brown/85">{label}</div>
      <div
        className={cn(
          "text-[21px] md:text-[27px] font-bold tabular-nums my-1.5",
          gold && "text-gold",
          ltr && "ltr-inline",
        )}
      >
        {value}
      </div>
      <div className="text-[11.5px] text-muted-brown/70 leading-snug">{foot}</div>
    </div>
  );
}

function Pace({ monthly }: { monthly: { month: string; hours: number }[] }) {
  const max = Math.max(...monthly.map((m) => m.hours), 1);
  return (
    <Panel title="קצב חודשי">
      <div className="flex items-end gap-4 px-4 md:px-5 py-4 h-[130px] overflow-x-auto">
        {monthly.map((m) => (
          <div key={m.month} className="flex flex-col items-center gap-1.5 shrink-0 w-12">
            <span className="text-[11.5px] font-bold text-cream tabular-nums">
              {hours(m.hours)}
            </span>
            <div
              className="w-full rounded-t bg-gradient-to-b from-gold to-gold-deep"
              style={{ height: `${Math.max((m.hours / max) * 62, 3)}px` }}
            />
            <span className="text-[10.5px] text-muted-brown/80">{monthLabel(m.month)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* -------------------------- shared shell -------------------------- */

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-cream/10 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 bg-sand/70 border-b border-cream/[0.07]">
        <h2 className="font-serif text-[14.5px] text-gold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function AddButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[12px] font-bold text-ink bg-gold rounded-md px-3 py-1.5 hover:bg-gold-deep transition-colors shrink-0"
    >
      {open ? "ביטול" : "+ הוספה"}
    </button>
  );
}

const inputCls =
  "w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-[14px] text-cream focus:outline-none focus:border-gold transition-colors";

/* -------------------------- work log -------------------------- */

function WorkLog({
  entries,
  balances,
  isEditor,
  totalHours,
  onChanged,
}: {
  entries: RetainerEntryRow[];
  balances: Map<string, number>;
  isEditor: boolean;
  totalHours: number;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Panel
      title="יומן עבודה"
      action={
        isEditor ? (
          <AddButton
            open={adding}
            onClick={() => {
              setAdding((v) => !v);
              setEditingId(null);
            }}
          />
        ) : undefined
      }
    >
      {adding && (
        <EntryForm
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {entries.length === 0 ? (
        <div className="py-8 text-center text-muted-brown/60 text-sm">טרם נרשמו שעות</div>
      ) : (
        <ul className="divide-y divide-cream/[0.07]">
          {entries.map((e) =>
            editingId === e.id ? (
              <li key={e.id}>
                <EntryForm
                  entry={e}
                  onDone={() => {
                    setEditingId(null);
                    onChanged();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <EntryRow
                key={e.id}
                entry={e}
                balance={balances.get(e.id) ?? 0}
                isEditor={isEditor}
                onEdit={() => {
                  setEditingId(e.id);
                  setAdding(false);
                }}
                onChanged={onChanged}
              />
            ),
          )}
        </ul>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 md:px-5 py-3 bg-sand/50 border-t border-cream/[0.07] text-[12.5px] text-muted-brown">
        <span>
          סה״כ שעות: <b className="text-cream tabular-nums">{hours(totalHours)}</b>
        </span>
        <span>
          רישומים: <b className="text-cream tabular-nums">{entries.length}</b>
        </span>
      </div>
    </Panel>
  );
}

function EntryRow({
  entry,
  balance,
  isEditor,
  onEdit,
  onChanged,
}: {
  entry: RetainerEntryRow;
  balance: number;
  isEditor: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const auto = entry.source === "claude-code";

  async function onDelete() {
    if (!confirm(`למחוק את הרישום "${entry.title}"?`)) return;
    setBusy(true);
    try {
      await deleteEntryAction({ data: { id: entry.id } });
      toast.success("הרישום נמחק");
      onChanged();
    } catch (err) {
      console.error("[partner] delete entry failed", err);
      toast.error("המחיקה נכשלה");
      setBusy(false);
    }
  }

  return (
    <li className={cn("px-4 md:px-5 py-3.5", busy && "opacity-50")}>
      <div className="flex items-start gap-3">
        <span className="text-[12.5px] text-muted-brown tabular-nums shrink-0 w-[42px] pt-0.5">
          {shortDate(entry.worked_on)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-cream">{entry.title}</span>
            <span
              className={cn(
                "text-[10.5px] font-bold px-2 py-px rounded-full border",
                auto
                  ? "border-gold/40 text-gold bg-gold/10"
                  : "border-muted-brown/30 text-muted-brown bg-muted-brown/[0.07]",
              )}
            >
              {auto ? "אוטו" : "ידני"}
            </span>
          </div>
          {entry.details && (
            <p className="text-[12px] text-muted-brown/70 leading-relaxed mt-1">{entry.details}</p>
          )}
          {isEditor && (
            <div className="flex gap-3 mt-1.5">
              <button onClick={onEdit} className="text-[11.5px] text-gold hover:underline">
                עריכה
              </button>
              <button
                onClick={onDelete}
                disabled={busy}
                className="text-[11.5px] text-destructive/80 hover:text-destructive hover:underline"
              >
                מחיקה
              </button>
            </div>
          )}
        </div>
        <div className="text-left shrink-0">
          <div className="text-[15px] font-bold text-gold tabular-nums">
            {hours(Number(entry.hours))}
          </div>
          <div className="text-[11px] text-muted-brown/70 tabular-nums">יתרה {hours(balance)}</div>
        </div>
      </div>
    </li>
  );
}

function EntryForm({
  entry,
  onDone,
  onCancel,
}: {
  entry?: RetainerEntryRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [workedOn, setWorkedOn] = useState(entry?.worked_on?.slice(0, 10) ?? todayInIsrael());
  const [hoursValue, setHoursValue] = useState(entry ? String(Number(entry.hours)) : "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [details, setDetails] = useState(entry?.details ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(hoursValue);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("יש להזין מספר שעות תקין");
      return;
    }
    if (!title.trim()) {
      toast.error("יש להזין כותרת");
      return;
    }
    setSaving(true);
    try {
      const payload = { workedOn, hours: n, title: title.trim(), details: details.trim() || null };
      if (entry) {
        await updateEntryAction({ data: { ...payload, id: entry.id } });
        toast.success("הרישום עודכן");
      } else {
        await createEntryAction({ data: payload });
        toast.success("הרישום נוסף");
      }
      onDone();
    } catch (err) {
      console.error("[partner] save entry failed", err);
      toast.error("השמירה נכשלה");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="px-4 md:px-5 py-4 bg-gold/[0.045] border-b border-cream/[0.07] flex flex-col gap-3"
    >
      <div className="flex flex-wrap gap-3">
        <label className="block w-[150px]">
          <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">תאריך</span>
          <input
            type="date"
            value={workedOn}
            onChange={(e) => setWorkedOn(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block w-[90px]">
          <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">שעות</span>
          {/* step="any": with a fixed step the browser silently refuses to
              submit any value off the step ladder (1.75 against step=0.1),
              with no visible error. Range is enforced server-side instead. */}
          <input
            type="number"
            step="any"
            min="0.1"
            value={hoursValue}
            onChange={(e) => setHoursValue(e.target.value)}
            dir="ltr"
            className={inputCls}
          />
        </label>
        <label className="block flex-1 min-w-[200px]">
          <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">כותרת</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">פירוט (לא חובה)</span>
        <textarea
          rows={2}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className={cn(inputCls, "resize-y")}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-gold text-ink px-5 py-2 rounded-md text-[13px] font-bold hover:bg-gold-deep transition-colors disabled:opacity-60"
        >
          {saving ? "שומר..." : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-[13px] text-muted-brown border border-cream/15 hover:text-cream transition-colors"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}

/* -------------------------- payments -------------------------- */

function Payments({
  payments,
  summary,
  isEditor,
  onChanged,
}: {
  payments: RetainerPaymentRow[];
  summary: Summary;
  isEditor: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Panel
      title="תשלומים"
      action={
        isEditor ? <AddButton open={adding} onClick={() => setAdding((v) => !v)} /> : undefined
      }
    >
      {adding && (
        <PaymentForm
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {payments.length === 0 ? (
        <div className="py-8 text-center text-muted-brown/60 text-sm">טרם נרשמו תשלומים</div>
      ) : (
        <ul className="divide-y divide-cream/[0.07]">
          {payments.map((p) => (
            <PaymentRow key={p.id} payment={p} isEditor={isEditor} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 md:px-5 py-3 bg-sand/50 border-t border-cream/[0.07] text-[12.5px] text-muted-brown">
        <span>
          סה״כ שולם: <b className="text-cream ltr-inline">{money(summary.paidTotal)}</b>
        </span>
        <span>
          נותר לתשלום: <b className="text-cream ltr-inline">{money(summary.paidRemaining)}</b>
        </span>
        <span>
          מתוך <b className="text-cream ltr-inline">{money(summary.totalAmount)}</b>
        </span>
      </div>
    </Panel>
  );
}

function PaymentRow({
  payment,
  isEditor,
  onChanged,
}: {
  payment: RetainerPaymentRow;
  isEditor: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm("למחוק את התשלום?")) return;
    setBusy(true);
    try {
      await deletePaymentAction({ data: { id: payment.id } });
      toast.success("התשלום נמחק");
      onChanged();
    } catch (err) {
      console.error("[partner] delete payment failed", err);
      toast.error("המחיקה נכשלה");
      setBusy(false);
    }
  }

  return (
    <li className={cn("px-4 md:px-5 py-3.5 flex items-start gap-3", busy && "opacity-50")}>
      <span className="text-[12.5px] text-muted-brown tabular-nums shrink-0 w-[42px] pt-0.5">
        {shortDate(payment.paid_on)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-cream ltr-inline tabular-nums">
          {money(Number(payment.amount))}
        </div>
        <div className="text-[12px] text-muted-brown/70 mt-0.5">
          {[payment.method, payment.note].filter(Boolean).join(" · ") || "—"}
        </div>
        {isEditor && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="text-[11.5px] text-destructive/80 hover:text-destructive hover:underline mt-1.5"
          >
            מחיקה
          </button>
        )}
      </div>
    </li>
  );
}

function PaymentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [paidOn, setPaidOn] = useState(todayInIsrael());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("יש להזין סכום תקין");
      return;
    }
    setSaving(true);
    try {
      await createPaymentAction({
        data: { paidOn, amount: n, method: method.trim() || null, note: note.trim() || null },
      });
      toast.success("התשלום נרשם");
      onDone();
    } catch (err) {
      console.error("[partner] save payment failed", err);
      toast.error("השמירה נכשלה");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="px-4 md:px-5 py-4 bg-gold/[0.045] border-b border-cream/[0.07] flex flex-col gap-3"
    >
      <div className="flex flex-wrap gap-3">
        <label className="block w-[150px]">
          <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">תאריך</span>
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block w-[130px]">
          <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">סכום</span>
          <input
            type="number"
            step="any"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            dir="ltr"
            className={inputCls}
          />
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">אמצעי</span>
          <input
            type="text"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="העברה בנקאית"
            className={inputCls}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">הערה (לא חובה)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-gold text-ink px-5 py-2 rounded-md text-[13px] font-bold hover:bg-gold-deep transition-colors disabled:opacity-60"
        >
          {saving ? "שומר..." : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-[13px] text-muted-brown border border-cream/15 hover:text-cream transition-colors"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}

/* -------------------------- bank settings -------------------------- */

function BankSettings({
  totalHours,
  totalAmount,
  onChanged,
}: {
  totalHours: number;
  totalAmount: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(String(totalHours));
  const [a, setA] = useState(String(totalAmount));
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hn = Number(h);
    const an = Number(a);
    if (!Number.isFinite(hn) || hn <= 0 || !Number.isFinite(an) || an < 0) {
      toast.error("ערכים לא תקינים");
      return;
    }
    setSaving(true);
    try {
      await updateConfigAction({ data: { totalHours: hn, totalAmount: an } });
      toast.success("תנאי הבנק עודכנו");
      setOpen(false);
      onChanged();
    } catch (err) {
      console.error("[partner] save config failed", err);
      toast.error("השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start text-[12.5px] text-muted-brown hover:text-gold transition-colors"
      >
        הגדרות הבנק
      </button>
    );
  }

  return (
    <Panel title="הגדרות הבנק">
      <form onSubmit={onSubmit} className="p-4 md:p-5 flex flex-wrap items-end gap-3">
        <label className="block w-[130px]">
          <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">סך שעות</span>
          <input
            type="number"
            step="any"
            value={h}
            onChange={(e) => setH(e.target.value)}
            dir="ltr"
            className={inputCls}
          />
        </label>
        <label className="block w-[150px]">
          <span className="text-[12.5px] font-semibold text-cream mb-1.5 block">סכום כולל</span>
          <input
            type="number"
            step="any"
            value={a}
            onChange={(e) => setA(e.target.value)}
            dir="ltr"
            className={inputCls}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="bg-gold text-ink px-5 py-2 rounded-md text-[13px] font-bold hover:bg-gold-deep transition-colors disabled:opacity-60"
        >
          {saving ? "שומר..." : "שמירה"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 rounded-md text-[13px] text-muted-brown border border-cream/15 hover:text-cream transition-colors"
        >
          ביטול
        </button>
      </form>
    </Panel>
  );
}

/* -------------------------- digest -------------------------- */

// The report goes out automatically on Sundays and Thursdays; this is the
// escape hatch for sending an extra one, or for checking how it reads.
function SendDigestButton() {
  const [sending, setSending] = useState(false);

  async function onSend() {
    if (!confirm("לשלוח עדכון מצב ליפעת עכשיו?")) return;
    setSending(true);
    try {
      await sendDigestNowAction({ data: undefined });
      toast.success("העדכון נשלח");
    } catch (err) {
      console.error("[partner] digest send failed", err);
      toast.error("שליחת העדכון נכשלה");
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      onClick={onSend}
      disabled={sending}
      className="text-[12.5px] text-muted-brown hover:text-gold transition-colors disabled:opacity-60"
    >
      {sending ? "שולח..." : "שליחת עדכון מצב עכשיו"}
    </button>
  );
}
