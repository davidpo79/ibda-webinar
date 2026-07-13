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

function AdminDashboard() {
  const { registrations, orders } = Route.useLoaderData();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
          <h2 className="font-serif text-lg text-gold mb-4">לידים ({registrations.length})</h2>
          <div className="border border-cream/10 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-sand/70 text-right">
                <tr>
                  <th className="px-4 py-3 font-semibold w-10"></th>
                  <th className="px-4 py-3 font-semibold">שם</th>
                  <th className="px-4 py-3 font-semibold">אימייל</th>
                  <th className="px-4 py-3 font-semibold">טלפון</th>
                  <th className="px-4 py-3 font-semibold">מסלולים</th>
                  <th className="px-4 py-3 font-semibold">מועד הרשמה</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((r) => {
                  const isOpen = expanded.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t border-cream/10 hover:bg-cream/[0.03]">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggle(r.id)}
                            aria-label="פרטים נוספים"
                            className="w-6 h-6 rounded border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/10 transition-colors"
                          >
                            {isOpen ? "–" : "+"}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="px-4 py-3 ltr-inline text-muted-brown">{r.email}</td>
                        <td className="px-4 py-3 ltr-inline text-muted-brown">{r.phone}</td>
                        <td className="px-4 py-3 text-muted-brown">
                          {packagesLabel(r.selected_packages)}
                        </td>
                        <td className="px-4 py-3 text-muted-brown">
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
                {registrations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-brown">
                      אין עדיין לידים
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-lg text-gold mb-4">רוכשים ({orders.length})</h2>
          <div className="border border-cream/10 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
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
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-cream/10 hover:bg-cream/[0.03]">
                    <td className="px-4 py-3 ltr-inline text-muted-brown">{o.order_reference}</td>
                    <td className="px-4 py-3 ltr-inline text-muted-brown">{o.email}</td>
                    <td className="px-4 py-3">{PACKAGE_LABELS[o.package_id] || o.package_id}</td>
                    <td className="px-4 py-3">{o.amount ? `₪${o.amount}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-semibold",
                          o.status === "paid" && "bg-green-500/15 text-green-400",
                          o.status === "failed" && "bg-destructive/15 text-destructive",
                          o.status === "created" && "bg-gold/15 text-gold",
                        )}
                      >
                        {o.status === "paid" ? "שולם" : o.status === "failed" ? "נכשל" : "ממתין"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-brown">
                      {formatSessionDate(o.updated_at)}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-brown">
                      אין עדיין רוכשים
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
