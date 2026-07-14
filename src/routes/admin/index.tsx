import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { getAdminDashboardData, adminLogout } from "@/lib/admin.functions";
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
const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

function AdminDashboard() {
  const { registrations, orders } = Route.useLoaderData();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [leadPackageFilter, setLeadPackageFilter] = useState("all");
  const [orderPackageFilter, setOrderPackageFilter] = useState("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");

  const filteredRegistrations = registrations.filter(
    (r) => leadPackageFilter === "all" || r.selected_packages.includes(leadPackageFilter),
  );
  const filteredOrders = orders.filter((o) => {
    const packages = o.package_id.split(",");
    const matchesPackage = orderPackageFilter === "all" || packages.includes(orderPackageFilter);
    const matchesStatus = orderStatusFilter === "all" || o.status === orderStatusFilter;
    return matchesPackage && matchesStatus;
  });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
            <FilterSelect
              label="מוצר"
              value={leadPackageFilter}
              onChange={setLeadPackageFilter}
              options={PACKAGE_OPTIONS}
            />
          </div>
          <div className="border border-cream/10 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[760px] table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-[15%]" />
                <col className="w-[19%]" />
                <col className="w-[13%]" />
                <col className="w-[32%]" />
                <col className="w-[13%]" />
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
                        <td className="px-4 py-3 ltr-inline text-muted-brown break-all">
                          {r.email}
                        </td>
                        <td className="px-4 py-3 ltr-inline text-muted-brown whitespace-nowrap">
                          {r.phone}
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
                                <dd className="ltr-inline">{r.email}</dd>
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
                                <dt className="text-muted-brown">מפגש/קוהורט</dt>
                                <dd>{r.session_title || "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-brown">מועד המפגש</dt>
                                <dd>{formatSessionDate(r.session_starts_at) || "—"}</dd>
                              </div>
                            </dl>
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
            <h2 className="font-serif text-lg text-gold">
              רוכשים ({filteredOrders.length}
              {filteredOrders.length !== orders.length ? ` מתוך ${orders.length}` : ""})
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              <FilterSelect
                label="מוצר"
                value={orderPackageFilter}
                onChange={setOrderPackageFilter}
                options={PACKAGE_OPTIONS}
              />
              <FilterSelect
                label="סטטוס"
                value={orderStatusFilter}
                onChange={setOrderStatusFilter}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>
          <div className="border border-cream/10 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[760px] table-fixed">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[19%]" />
                <col className="w-[30%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-sand/70 text-right">
                <tr>
                  <th className="px-4 py-3 font-semibold">מספר עסקה</th>
                  <th className="px-4 py-3 font-semibold">אימייל</th>
                  <th className="px-4 py-3 font-semibold">חבילה</th>
                  <th className="px-4 py-3 font-semibold">סכום</th>
                  <th className="px-4 py-3 font-semibold">סטטוס</th>
                  <th className="px-4 py-3 font-semibold">עודכן</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-cream/10 hover:bg-cream/[0.03] align-top"
                  >
                    <td className="px-4 py-3 ltr-inline text-muted-brown break-all">
                      {o.order_reference}
                    </td>
                    <td className="px-4 py-3 ltr-inline text-muted-brown break-all">{o.email}</td>
                    <td className="px-4 py-3 break-words">
                      {packagesLabel(o.package_id.split(","))}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {o.amount ? `₪${o.amount}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-semibold",
                          o.status === "paid" && "bg-green-500/15 text-green-400",
                          o.status === "failed" && "bg-destructive/15 text-destructive",
                          o.status === "created" && "bg-gold/15 text-gold",
                        )}
                      >
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-brown whitespace-nowrap">
                      {formatSessionDate(o.updated_at)}
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-brown">
                      {orders.length === 0 ? "אין עדיין רוכשים" : "אין רוכשים התואמים לסינון"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
