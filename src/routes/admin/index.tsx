import { createFileRoute, redirect, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  getAdminDashboardData,
  adminLogout,
  updateRegistrationAction,
  sendCouponToLeadAction,
  verifyOrderPaymentAction,
  forceMarkOrderPaidAction,
} from "@/lib/admin.functions";
import type { RegistrationRow } from "@/lib/registrations.server";
import type { OrderWithContact } from "@/lib/admin.functions";
import { formatSessionDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "אדמין · לידים ורוכשים · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminDashboardData();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminDashboard,
});

const PACKAGE_LABELS: Record<string, string> = {
  open: "וובינר פתוח",
  core_full: "הסדרה המלאה",
  core_single: "וובינר בודד",
  premium_litigation: "סדנת ליטיגציה",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום",
};

function packagesLabel(ids: string[]): string {
  return ids.map((id) => PACKAGE_LABELS[id] || id).join(", ") || "—";
}

const STATUS_LABELS: Record<string, string> = {
  paid: "שולם",
  failed: "נכשל",
  created: "ממתין",
};

// A transaction covering several products renders as several adjacent line
// items (see buildOrderLineItems in orders.server.ts, which guarantees
// same-order_reference rows are always adjacent) — cluster them into one
// entry per transaction so the table can show one row per order_reference,
// expandable (like the leads table) into its per-product line items.
function groupOrdersByReference<T extends { order_reference: string }>(
  rows: T[],
): { order_reference: string; items: T[] }[] {
  const groups: { order_reference: string; items: T[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.order_reference === row.order_reference) {
      last.items.push(row);
    } else {
      groups.push({ order_reference: row.order_reference, items: [row] });
    }
  }
  return groups;
}

function sumAmounts(items: { amount: string | null }[]): number {
  return items.reduce((sum, item) => sum + (item.amount ? Number(item.amount) : 0), 0);
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-brown">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-ink/40 border border-cream/15 rounded-md px-3 py-1.5 text-sm text-cream focus:outline-none focus:border-gold"
      >
        <option value="all">הכל</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const PACKAGE_OPTIONS = Object.entries(PACKAGE_LABELS).map(([value, label]) => ({ value, label }));
const LESSON_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
  value: String(i + 1),
  label: `שיעור ${i + 1}`,
}));

function AdminDashboard() {
  const { registrations, orders } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [leadPackageFilter, setLeadPackageFilter] = useState("all");
  const [leadLessonFilter, setLeadLessonFilter] = useState("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [orderPackageFilter, setOrderPackageFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [verifyingOrders, setVerifyingOrders] = useState<Set<string>>(new Set());
  const [forcingOrders, setForcingOrders] = useState<Set<string>>(new Set());

  const leadSearchNorm = leadSearch.trim().toLowerCase();
  const filteredRegistrations = registrations.filter((r) => {
    const matchesPackage =
      leadPackageFilter === "all" || r.selected_packages.includes(leadPackageFilter);
    const matchesLesson =
      leadLessonFilter === "all" ||
      (r.selected_packages.includes("core_single") &&
        (r.core_single_lesson_indexes ?? []).includes(Number(leadLessonFilter)));
    const matchesSearch =
      !leadSearchNorm ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(leadSearchNorm) ||
      r.email.toLowerCase().includes(leadSearchNorm) ||
      r.phone.toLowerCase().includes(leadSearchNorm);
    return matchesPackage && matchesLesson && matchesSearch;
  });
  const orderSearchNorm = orderSearch.trim().toLowerCase();
  const filteredOrders = orders.filter((o) => {
    const matchesPackage = orderPackageFilter === "all" || o.package_id === orderPackageFilter;
    const matchesSearch =
      !orderSearchNorm ||
      o.email.toLowerCase().includes(orderSearchNorm) ||
      o.order_reference.toLowerCase().includes(orderSearchNorm);
    return matchesPackage && matchesSearch;
  });
  // Split by outcome rather than filtering to one status at a time — a
  // "רוכשים" table of confirmed sales and a "נוטשי עגלה" table of
  // pending/failed orders that need attention, shown side by side instead
  // of behind a status dropdown.
  const paidGroups = groupOrdersByReference(filteredOrders.filter((o) => o.status === "paid"));
  const abandonedGroups = groupOrdersByReference(filteredOrders.filter((o) => o.status !== "paid"));
  const leadFiltersActive =
    leadPackageFilter !== "all" || leadLessonFilter !== "all" || Boolean(leadSearchNorm);
  const orderFiltersActive = orderPackageFilter !== "all" || Boolean(orderSearchNorm);

  function clearLeadFilters() {
    setLeadPackageFilter("all");
    setLeadLessonFilter("all");
    setLeadSearch("");
  }
  function clearOrderFilters() {
    setOrderPackageFilter("all");
    setOrderSearch("");
  }

  async function onVerifyOrder(orderReference: string, transactionId: string) {
    setVerifyingOrders((s) => new Set(s).add(orderReference));
    try {
      const result = await verifyOrderPaymentAction({ data: { orderReference, transactionId } });
      if (result.outcome === "paid") {
        toast.success("התשלום אומת מול הסליקה — ההזמנה סומנה כשולם והמייל נשלח ללקוח");
        await router.invalidate();
      } else if (result.outcome === "failed") {
        toast.error("מול הסליקה, התשלום הזה לא אושר — ההזמנה סומנה כנכשלה");
        await router.invalidate();
      } else if (result.outcome === "not_found") {
        toast.error("ההזמנה לא נמצאה");
      } else {
        toast.error("לא ניתן לאמת כרגע מול הסליקה. נסו שוב בעוד רגע.");
      }
    } catch (err) {
      console.error("[admin] verify order error", err);
      toast.error("שגיאה באימות ההזמנה");
    } finally {
      setVerifyingOrders((s) => {
        const n = new Set(s);
        n.delete(orderReference);
        return n;
      });
    }
  }

  // Bypasses the Sumit check entirely — for when the admin has already
  // confirmed the charge some other way (Sumit's own dashboard, a bank
  // statement) and the real verify above can't resolve it.
  async function onForceMarkPaid(orderReference: string) {
    if (
      !window.confirm(
        'לאשר ידנית שההזמנה שולמה?\n\nהפעולה תסמן את ההזמנה כ"שולם" ותשלח ללקוח את מייל הוובינר — ללא בדיקה מול חברת הסליקה. יש להשתמש בזה רק אם וידאתם בעצמכם שהתשלום התקבל בפועל.',
      )
    ) {
      return;
    }
    setForcingOrders((s) => new Set(s).add(orderReference));
    try {
      const result = await forceMarkOrderPaidAction({ data: { orderReference } });
      if (result.outcome === "paid") {
        toast.success('ההזמנה סומנה כ"שולם" והמייל נשלח ללקוח');
        await router.invalidate();
      } else {
        toast.error("ההזמנה לא נמצאה");
      }
    } catch (err) {
      console.error("[admin] force mark paid error", err);
      toast.error("השמירה נכשלה. נסו שוב.");
    } finally {
      setForcingOrders((s) => {
        const n = new Set(s);
        n.delete(orderReference);
        return n;
      });
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleOrder(orderReference: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderReference)) next.delete(orderReference);
      else next.add(orderReference);
      return next;
    });
  }

  async function onLogout() {
    await adminLogout();
    navigate({ to: "/admin/login" });
  }

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">ניהול IBDA</h1>
        <nav className="flex items-center gap-5 text-sm">
          <Link to="/admin/schedule" className="text-muted-brown hover:text-gold transition-colors">
            עריכת מועדים
          </Link>
          <Link to="/admin/pricing" className="text-muted-brown hover:text-gold transition-colors">
            תמחור
          </Link>
          <Link to="/admin/coupons" className="text-muted-brown hover:text-gold transition-colors">
            קופונים
          </Link>
          <Link to="/admin/emails" className="text-muted-brown hover:text-gold transition-colors">
            עריכת מיילים
          </Link>
          <Link to="/admin/settings" className="text-muted-brown hover:text-gold transition-colors">
            הגדרות מייל
          </Link>
          <button onClick={onLogout} className="text-muted-brown hover:text-gold transition-colors">
            התנתקות
          </button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-14">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="font-serif text-lg text-gold">
              לידים ({filteredRegistrations.length}
              {filteredRegistrations.length !== registrations.length
                ? ` מתוך ${registrations.length}`
                : ""}
              )
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="search"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="חיפוש לפי שם, אימייל או טלפון"
                className="bg-ink/40 border border-cream/15 rounded-md px-3 py-1.5 text-sm text-cream placeholder:text-muted-brown/60 focus:outline-none focus:border-gold w-56"
              />
              <FilterSelect
                label="מוצר"
                value={leadPackageFilter}
                onChange={setLeadPackageFilter}
                options={PACKAGE_OPTIONS}
              />
              <FilterSelect
                label="שיעור בודד"
                value={leadLessonFilter}
                onChange={setLeadLessonFilter}
                options={LESSON_OPTIONS}
              />
              {leadFiltersActive && (
                <button
                  type="button"
                  onClick={clearLeadFilters}
                  className="text-xs text-muted-brown hover:text-gold underline"
                >
                  נקה סינון
                </button>
              )}
            </div>
          </div>
          {/* Mobile: one card per lead — a fixed-width table doesn't fit a phone screen */}
          <div className="md:hidden space-y-3">
            {filteredRegistrations.map((r) => (
              <LeadCard
                key={r.id}
                registration={r}
                isOpen={expanded.has(r.id)}
                onToggle={() => toggle(r.id)}
                onSaved={() => router.invalidate()}
              />
            ))}
            {filteredRegistrations.length === 0 && (
              <div className="border border-cream/10 rounded-lg px-4 py-8 text-center text-muted-brown text-sm">
                {registrations.length === 0 ? "אין עדיין לידים" : "אין לידים התואמים לסינון"}
              </div>
            )}
          </div>

          {/* Desktop: full table */}
          <div className="hidden md:block border border-cream/10 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[820px] table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-[140px]" />
                <col className="w-[190px]" />
                <col className="w-[110px]" />
                <col />
                <col className="w-[130px]" />
              </colgroup>
              <thead className="bg-sand/70 text-right">
                <tr>
                  <th className="px-4 py-3 font-semibold"></th>
                  <th className="px-4 py-3 font-semibold">שם</th>
                  <th className="px-4 py-3 font-semibold">אימייל</th>
                  <th className="px-4 py-3 font-semibold">טלפון</th>
                  <th className="px-4 py-3 font-semibold">מסלולים</th>
                  <th className="px-4 py-3 font-semibold">מועד הרשמה</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.map((r) => {
                  const isOpen = expanded.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t border-cream/10 hover:bg-cream/[0.03] align-top">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggle(r.id)}
                            aria-label="פרטים נוספים"
                            className="w-6 h-6 rounded border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/10 transition-colors"
                          >
                            {isOpen ? "–" : "+"}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium break-words">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="px-4 py-3 text-muted-brown">
                          <span className="ltr-inline break-all">{r.email}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-brown">
                          <span className="ltr-inline whitespace-nowrap">{r.phone}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-brown break-words">
                          {packagesLabel(r.selected_packages)}
                        </td>
                        <td className="px-4 py-3 text-muted-brown whitespace-nowrap">
                          {formatSessionDate(r.created_at)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-cream/10 bg-ink/40">
                          <td />
                          <td colSpan={5} className="px-4 py-4">
                            <LeadDetailPanel registration={r} onSaved={() => router.invalidate()} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredRegistrations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-brown">
                      {registrations.length === 0 ? "אין עדיין לידים" : "אין לידים התואמים לסינון"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="font-serif text-lg text-gold">סינון רוכשים</h2>
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="search"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="חיפוש לפי אימייל או מספר הזמנה"
                className="bg-ink/40 border border-cream/15 rounded-md px-3 py-1.5 text-sm text-cream placeholder:text-muted-brown/60 focus:outline-none focus:border-gold w-56"
              />
              <FilterSelect
                label="מוצר"
                value={orderPackageFilter}
                onChange={setOrderPackageFilter}
                options={PACKAGE_OPTIONS}
              />
              {orderFiltersActive && (
                <button
                  type="button"
                  onClick={clearOrderFilters}
                  className="text-xs text-muted-brown hover:text-gold underline"
                >
                  נקה סינון
                </button>
              )}
            </div>
          </div>

          <h3 className="font-serif text-lg text-gold mb-4">רוכשים ({paidGroups.length})</h3>
          <OrderGroupsTable
            groups={paidGroups}
            expandedOrders={expandedOrders}
            toggleOrder={toggleOrder}
            emptyMessage="אין עדיין רוכשים"
          />

          <h3 className="font-serif text-lg text-gold mb-4 mt-10">
            נוטשי עגלה ({abandonedGroups.length})
          </h3>
          <p className="text-muted-brown text-xs mb-4 -mt-2">
            הזמנות שעדיין ממתינות או שנכשלו. אם לקוח מדווח שהחיוב עבר אבל לא קיבל מייל, "אימות
            הזמנה" בודק את התשלום מול הסליקה בפועל ומסמן כשולם רק אם הוא אכן אושר שם. אם וידאתם
            בעצמכם שהתשלום התקבל (למשל בדוח הסליקה) והבדיקה האוטומטית לא הצליחה, אפשר להשתמש ב"אישור
            ידני" שמסמן ושולח מייד, ללא בדיקה.
          </p>
          <OrderGroupsTable
            groups={abandonedGroups}
            expandedOrders={expandedOrders}
            toggleOrder={toggleOrder}
            emptyMessage="אין נוטשי עגלה"
            showVerify
            verifyingOrders={verifyingOrders}
            onVerifyOrder={onVerifyOrder}
            forcingOrders={forcingOrders}
            onForceMarkPaid={onForceMarkPaid}
          />
        </section>
      </main>
    </div>
  );
}

// Mobile card for one lead — replaces the desktop table below the md
// breakpoint, where a 6-column fixed-width table can't fit on a phone
// screen without hiding columns behind horizontal scroll.
function LeadCard({
  registration: r,
  isOpen,
  onToggle,
  onSaved,
}: {
  registration: RegistrationRow;
  isOpen: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="border border-cream/10 rounded-lg p-4 bg-ink/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-cream break-words">
            {r.first_name} {r.last_name}
          </div>
          <div className="text-muted-brown text-sm mt-1">
            <span className="ltr-inline break-all">{r.email}</span>
          </div>
          <div className="text-muted-brown text-sm mt-0.5">
            <span className="ltr-inline">{r.phone}</span>
          </div>
        </div>
        <button
          onClick={onToggle}
          aria-label="פרטים נוספים"
          className="shrink-0 w-11 h-11 rounded border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/10 transition-colors text-lg"
        >
          {isOpen ? "–" : "+"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-brown">
        <span className="break-words">{packagesLabel(r.selected_packages)}</span>
        <span className="whitespace-nowrap">{formatSessionDate(r.created_at)}</span>
      </div>
      {isOpen && (
        <div className="mt-4 pt-4 border-t border-cream/10">
          <LeadDetailPanel registration={r} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

// Renders one orders section (mobile cards + desktop table) — shared by the
// "רוכשים" (paid) and "נוטשי עגלה" (pending/failed) sections so the two
// don't duplicate the whole table markup. showVerify adds the "אימות
// הזמנה" action, only relevant for the abandoned-cart section.
function OrderGroupsTable({
  groups,
  expandedOrders,
  toggleOrder,
  emptyMessage,
  showVerify = false,
  verifyingOrders,
  onVerifyOrder,
  forcingOrders,
  onForceMarkPaid,
}: {
  groups: { order_reference: string; items: OrderWithContact[] }[];
  expandedOrders: Set<string>;
  toggleOrder: (orderReference: string) => void;
  emptyMessage: string;
  showVerify?: boolean;
  verifyingOrders?: Set<string>;
  onVerifyOrder?: (orderReference: string, transactionId: string) => void;
  forcingOrders?: Set<string>;
  onForceMarkPaid?: (orderReference: string) => void;
}) {
  return (
    <>
      {/* Mobile: one card per order — a fixed-width table doesn't fit a phone screen */}
      <div className="md:hidden space-y-3 mb-10">
        {groups
          .flatMap((g) => g.items)
          .map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onVerify={showVerify ? onVerifyOrder : undefined}
              verifying={verifyingOrders?.has(o.order_reference) ?? false}
              onForceMarkPaid={showVerify ? onForceMarkPaid : undefined}
              forcing={forcingOrders?.has(o.order_reference) ?? false}
            />
          ))}
        {groups.length === 0 && (
          <div className="border border-cream/10 rounded-lg px-4 py-8 text-center text-muted-brown text-sm">
            {emptyMessage}
          </div>
        )}
      </div>

      {/* Desktop: full table — one row per transaction, expandable into
          its per-product line items (same pattern as the leads table). */}
      <div className="hidden md:block border border-cream/10 rounded-lg overflow-x-auto mb-10">
        <table
          className={cn(
            "w-full text-sm table-fixed",
            showVerify ? "min-w-[1620px]" : "min-w-[1320px]",
          )}
        >
          <colgroup>
            <col className="w-10" />
            <col className="w-[190px]" />
            <col className="w-[140px]" />
            <col className="w-[110px]" />
            <col className="w-[190px]" />
            <col />
            <col className="w-[90px]" />
            <col className="w-[100px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            {showVerify && <col className="w-[300px]" />}
          </colgroup>
          <thead className="bg-sand/70 text-right">
            <tr>
              <th className="px-4 py-3 font-semibold"></th>
              <th className="px-4 py-3 font-semibold">מספר עסקה</th>
              <th className="px-4 py-3 font-semibold">שם</th>
              <th className="px-4 py-3 font-semibold">טלפון</th>
              <th className="px-4 py-3 font-semibold">אימייל</th>
              <th className="px-4 py-3 font-semibold">מוצר</th>
              <th className="px-4 py-3 font-semibold">סכום</th>
              <th className="px-4 py-3 font-semibold">סטטוס</th>
              <th className="px-4 py-3 font-semibold">מועד המפגש הבא</th>
              <th className="px-4 py-3 font-semibold">בוצע בתאריך</th>
              {showVerify && <th className="px-4 py-3 font-semibold">פעולות</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const head = group.items[0];
              const isMulti = group.items.length > 1;
              const isOpen = expandedOrders.has(group.order_reference);
              const totalAmount = sumAmounts(group.items);
              const verifying = verifyingOrders?.has(group.order_reference) ?? false;
              const forcing = forcingOrders?.has(group.order_reference) ?? false;
              return (
                <Fragment key={group.order_reference}>
                  <tr className="border-t border-cream/10 hover:bg-cream/[0.03] align-top">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleOrder(group.order_reference)}
                        aria-label="פרטי מוצרים"
                        className="w-6 h-6 rounded border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/10 transition-colors"
                      >
                        {isOpen ? "–" : "+"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-brown">
                      <span className="ltr-inline break-all">{group.order_reference}</span>
                    </td>
                    <td className="px-4 py-3 font-medium break-words">{head.buyer_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-brown">
                      <span className="ltr-inline whitespace-nowrap">
                        {head.buyer_phone || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-brown">
                      <span className="ltr-inline break-all">{head.email}</span>
                    </td>
                    <td className="px-4 py-3 break-words">
                      {packagesLabel(group.items.map((item) => item.package_id))}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {totalAmount ? `₪${totalAmount}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={head.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-brown whitespace-nowrap">
                      {isMulti ? "—" : formatSessionDate(head.session_starts_at) || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-brown whitespace-nowrap">
                      {formatSessionDate(head.created_at) || "—"}
                    </td>
                    {showVerify && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {head.transaction_id ? (
                            <button
                              type="button"
                              onClick={() =>
                                onVerifyOrder?.(group.order_reference, head.transaction_id!)
                              }
                              disabled={verifying}
                              className="border border-gold/50 text-gold px-3 py-1 rounded-md text-xs font-semibold hover:bg-gold/10 transition-colors disabled:opacity-50"
                            >
                              {verifying ? "בודק..." : "אימות מול הסליקה"}
                            </button>
                          ) : (
                            <span className="text-muted-brown text-xs">אין עסקה לאימות</span>
                          )}
                          <button
                            type="button"
                            onClick={() => onForceMarkPaid?.(group.order_reference)}
                            disabled={forcing}
                            className="border border-cream/20 text-cream px-3 py-1 rounded-md text-xs font-semibold hover:bg-cream/10 transition-colors disabled:opacity-50"
                          >
                            {forcing ? "שומר..." : "אישור ידני"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isOpen &&
                    group.items.map((item) => (
                      <tr key={item.id} className="border-t border-cream/10 bg-ink/40">
                        <td colSpan={5} />
                        <td className="px-4 py-3 pr-8 break-words text-muted-brown">
                          {PACKAGE_LABELS[item.package_id] || item.package_id}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-brown">
                          {item.amount ? `₪${item.amount}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <OrderStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-brown whitespace-nowrap">
                          {formatSessionDate(item.session_starts_at) || "—"}
                        </td>
                        <td />
                        {showVerify && <td />}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr>
                <td
                  colSpan={showVerify ? 11 : 10}
                  className="px-4 py-8 text-center text-muted-brown"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OrderStatusBadge({ status }: { status: OrderWithContact["status"] }) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-xs font-semibold",
        status === "paid" && "bg-green-500/15 text-green-400",
        status === "failed" && "bg-destructive/15 text-destructive",
        status === "created" && "bg-gold/15 text-gold",
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// Mobile card for one order — same reasoning as LeadCard above. onVerify is
// only passed for the abandoned-cart section's cards.
function OrderCard({
  order: o,
  onVerify,
  verifying,
  onForceMarkPaid,
  forcing,
}: {
  order: OrderWithContact;
  onVerify?: (orderReference: string, transactionId: string) => void;
  verifying?: boolean;
  onForceMarkPaid?: (orderReference: string) => void;
  forcing?: boolean;
}) {
  return (
    <div className="border border-cream/10 rounded-lg p-4 bg-ink/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-cream break-words">
            {PACKAGE_LABELS[o.package_id] || o.package_id}
          </div>
          <div className="text-muted-brown text-sm break-words mt-1">{o.buyer_name || "—"}</div>
          <div className="text-muted-brown text-sm mt-0.5">
            <span className="ltr-inline break-all">{o.email}</span>
          </div>
          <div className="text-muted-brown text-sm ltr-inline mt-0.5">{o.buyer_phone || "—"}</div>
        </div>
        <div className="shrink-0">
          <OrderStatusBadge status={o.status} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-brown">
        <span className="whitespace-nowrap">{o.amount ? `₪${o.amount}` : "—"}</span>
        <span className="whitespace-nowrap">{formatSessionDate(o.session_starts_at) || "—"}</span>
        <span className="ltr-inline break-all">{o.order_reference}</span>
      </div>
      <div className="mt-1 text-xs text-muted-brown">
        בוצע בתאריך:{" "}
        <span className="whitespace-nowrap">{formatSessionDate(o.created_at) || "—"}</span>
      </div>
      {onVerify && (
        <div className="mt-3 space-y-2">
          {o.transaction_id ? (
            <button
              type="button"
              onClick={() => onVerify(o.order_reference, o.transaction_id!)}
              disabled={verifying}
              className="w-full border border-gold/50 text-gold px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-gold/10 transition-colors disabled:opacity-50"
            >
              {verifying ? "בודק..." : "אימות מול הסליקה"}
            </button>
          ) : (
            <span className="text-muted-brown text-xs block">אין עסקה לאימות מול הסליקה</span>
          )}
          {onForceMarkPaid && (
            <button
              type="button"
              onClick={() => onForceMarkPaid(o.order_reference)}
              disabled={forcing}
              className="w-full border border-cream/20 text-cream px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-cream/10 transition-colors disabled:opacity-50"
            >
              {forcing ? "שומר..." : "אישור ידני"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Lead contact details, view mode by default with an "עריכת פרטי קשר" toggle
// into an editable form — used to fix e.g. a phone number that ended up
// pasted into the email field at submission time.
function LeadDetailPanel({
  registration: r,
  onSaved,
}: {
  registration: RegistrationRow;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [first_name, setFirstName] = useState(r.first_name);
  const [last_name, setLastName] = useState(r.last_name);
  const [email, setEmail] = useState(r.email);
  const [phone, setPhone] = useState(r.phone);
  const [firm_name, setFirmName] = useState(r.firm_name || "");
  const [bar_license, setBarLicense] = useState(r.bar_license || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setFirstName(r.first_name);
    setLastName(r.last_name);
    setEmail(r.email);
    setPhone(r.phone);
    setFirmName(r.firm_name || "");
    setBarLicense(r.bar_license || "");
    setError(null);
    setEditing(true);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await updateRegistrationAction({
        data: {
          id: r.id,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          firm_name: firm_name.trim(),
          bar_license: bar_license.trim(),
        },
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      console.error("[admin] update registration failed", err);
      setError("שמירה נכשלה. ודאו שהאימייל תקין ונסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <EditField label="שם פרטי" value={first_name} onChange={setFirstName} />
          <EditField label="שם משפחה" value={last_name} onChange={setLastName} />
          <EditField label="אימייל" value={email} onChange={setEmail} dir="ltr" />
          <EditField label="טלפון" value={phone} onChange={setPhone} dir="ltr" />
          <EditField label="שם משרד/חברה" value={firm_name} onChange={setFirmName} />
          <EditField
            label="מספר רישיון עו״ד"
            value={bar_license}
            onChange={setBarLicense}
            dir="ltr"
          />
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="bg-gold text-ink px-4 py-2 rounded-md text-xs font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
          >
            {saving ? "שומר..." : "שמירה"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-muted-brown hover:text-cream"
          >
            ביטול
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-[13px]">
        <div>
          <dt className="text-muted-brown">שם פרטי</dt>
          <dd>{r.first_name}</dd>
        </div>
        <div>
          <dt className="text-muted-brown">שם משפחה</dt>
          <dd>{r.last_name}</dd>
        </div>
        <div>
          <dt className="text-muted-brown">אימייל</dt>
          <dd className="ltr-inline break-all">{r.email}</dd>
        </div>
        <div>
          <dt className="text-muted-brown">טלפון</dt>
          <dd className="ltr-inline">{r.phone}</dd>
        </div>
        <div>
          <dt className="text-muted-brown">שם משרד/חברה</dt>
          <dd>{r.firm_name || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-brown">מספר רישיון עו״ד</dt>
          <dd className="ltr-inline">{r.bar_license || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-brown">מסלולים</dt>
          <dd>{packagesLabel(r.selected_packages)}</dd>
        </div>
        <div>
          <dt className="text-muted-brown">מפגש</dt>
          <dd>{r.session_title || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-brown">מועד המפגש</dt>
          <dd>{formatSessionDate(r.session_starts_at) || "—"}</dd>
        </div>
      </dl>
      <div className="flex items-center gap-4">
        <button type="button" onClick={startEdit} className="text-xs text-gold hover:underline">
          עריכת פרטי קשר
        </button>
        <SendCouponControl registrationId={r.id} email={r.email} />
      </div>
    </div>
  );
}

// Generates a one-time discount coupon for this lead and emails it to them
// directly — the per-lead half of the coupon system (the other half,
// reusable generic codes, lives on /admin/coupons).
function SendCouponControl({ registrationId, email }: { registrationId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("15");
  const [sending, setSending] = useState(false);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSend() {
    if (!window.confirm(`לשלוח קוד הנחה של ${discountPercent}% למייל ${email}?`)) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendCouponToLeadAction({
        data: { registrationId, discountPercent: Number(discountPercent) },
      });
      setSentCode(result.code);
    } catch (err) {
      console.error("[admin] send coupon failed", err);
      setError("שליחת הקוד נכשלה");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gold hover:underline"
      >
        שליחת קוד הנחה
      </button>
    );
  }

  if (sentCode) {
    return <span className="text-xs text-green-400">נשלח קוד {sentCode} במייל</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={discountPercent}
        onChange={(e) => setDiscountPercent(e.target.value)}
        className="bg-ink/40 border border-cream/15 rounded-md px-2 py-1 text-xs text-cream focus:outline-none focus:border-gold"
      >
        {[10, 15, 20, 25, 30, 40, 50].map((n) => (
          <option key={n} value={n}>
            {n}%
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        className="bg-gold text-ink px-3 py-1 rounded-md text-xs font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
      >
        {sending ? "שולח..." : "שליחה"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted-brown hover:text-cream"
      >
        ביטול
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: "ltr" | "rtl";
}) {
  return (
    <label className="block">
      <span className="text-[12px] text-muted-brown mb-1 block">{label}</span>
      <input
        type="text"
        dir={dir}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-[13px] text-cream focus:outline-none focus:border-gold"
      />
    </label>
  );
}
