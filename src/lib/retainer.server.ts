import { sql } from "./db.server";

// numeric columns come back from postgres.js as strings — every consumer
// here converts explicitly rather than relying on implicit coercion, so a
// stray string never leaks into an arithmetic expression.

export type RetainerConfigRow = {
  id: number;
  total_hours: string;
  total_amount: string;
  started_on: string | null;
  updated_at: string;
};

export type RetainerEntryRow = {
  id: string;
  worked_on: string;
  hours: string;
  title: string;
  details: string | null;
  source: "manual" | "claude-code";
  session_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RetainerPaymentRow = {
  id: string;
  paid_on: string;
  amount: string;
  method: string | null;
  note: string | null;
  created_at: string;
};

export async function getRetainerConfig(): Promise<RetainerConfigRow | null> {
  const rows = await sql()<RetainerConfigRow[]>`SELECT * FROM retainer_config WHERE id = 1`;
  return rows[0] ?? null;
}

// Formatted in SQL rather than in JS: postgres.js hands a `date` column back
// as a JS Date, and stringifying that yields "Fri Jul 31 ..." rather than an
// ISO day — which silently breaks any lexical comparison against "YYYY-MM-DD"
// strings. Returning text keeps the comparison honest.
export async function getRetainerStartDate(): Promise<string | null> {
  const rows = await sql()<{ started_on: string | null }[]>`
    SELECT to_char(started_on, 'YYYY-MM-DD') AS started_on FROM retainer_config WHERE id = 1
  `;
  return rows[0]?.started_on ?? null;
}

export async function updateRetainerConfig(data: {
  totalHours: number;
  totalAmount: number;
}): Promise<void> {
  await sql()`
    UPDATE retainer_config
    SET total_hours = ${data.totalHours},
        total_amount = ${data.totalAmount},
        updated_at = now()
    WHERE id = 1
  `;
}

// Newest first — the page reads as a reverse-chronological journal, and the
// running-balance column is computed from this order.
export async function listEntries(): Promise<RetainerEntryRow[]> {
  return sql()<RetainerEntryRow[]>`
    SELECT * FROM retainer_entries ORDER BY worked_on DESC, created_at DESC
  `;
}

export async function createEntry(data: {
  workedOn: string;
  hours: number;
  title: string;
  details: string | null;
}): Promise<RetainerEntryRow> {
  const rows = await sql()<RetainerEntryRow[]>`
    INSERT INTO retainer_entries (worked_on, hours, title, details, source)
    VALUES (${data.workedOn}, ${data.hours}, ${data.title}, ${data.details}, 'manual')
    RETURNING *
  `;
  return rows[0];
}

export async function updateEntry(
  id: string,
  data: { workedOn: string; hours: number; title: string; details: string | null },
): Promise<void> {
  await sql()`
    UPDATE retainer_entries
    SET worked_on = ${data.workedOn},
        hours = ${data.hours},
        title = ${data.title},
        details = ${data.details},
        updated_at = now()
    WHERE id = ${id}
  `;
}

export async function deleteEntry(id: string): Promise<void> {
  await sql()`DELETE FROM retainer_entries WHERE id = ${id}`;
}

// The automatic path. Keyed on (session_id, worked_on) so re-running the
// sync during a session overwrites that day's row with the newer, larger
// measurement instead of stacking duplicates. The description is only
// overwritten when the caller actually supplies one — a plain re-sync
// shouldn't wipe a title that was written by hand afterwards.
export async function upsertSessionDay(data: {
  sessionId: string;
  workedOn: string;
  hours: number;
  title: string | null;
  details: string | null;
}): Promise<void> {
  await sql()`
    INSERT INTO retainer_entries (worked_on, hours, title, details, source, session_id)
    VALUES (
      ${data.workedOn},
      ${data.hours},
      ${data.title ?? "עבודת פיתוח"},
      ${data.details},
      'claude-code',
      ${data.sessionId}
    )
    ON CONFLICT (session_id, worked_on) WHERE session_id IS NOT NULL
    DO UPDATE SET
      hours = EXCLUDED.hours,
      title = COALESCE(${data.title}, retainer_entries.title),
      details = COALESCE(${data.details}, retainer_entries.details),
      updated_at = now()
  `;
}

export async function listPayments(): Promise<RetainerPaymentRow[]> {
  return sql()<RetainerPaymentRow[]>`
    SELECT * FROM retainer_payments ORDER BY paid_on DESC, created_at DESC
  `;
}

export async function createPayment(data: {
  paidOn: string;
  amount: number;
  method: string | null;
  note: string | null;
}): Promise<RetainerPaymentRow> {
  const rows = await sql()<RetainerPaymentRow[]>`
    INSERT INTO retainer_payments (paid_on, amount, method, note)
    VALUES (${data.paidOn}, ${data.amount}, ${data.method}, ${data.note})
    RETURNING *
  `;
  return rows[0];
}

export async function deletePayment(id: string): Promise<void> {
  await sql()`DELETE FROM retainer_payments WHERE id = ${id}`;
}

export type MonthlyPace = { month: string; hours: number };

export type RetainerSummary = {
  startedOn: string | null;
  totalHours: number;
  totalAmount: number;
  hourlyRate: number;
  hoursUsed: number;
  hoursRemaining: number;
  percentUsed: number;
  overageHours: number;
  valueUsed: number;
  paidTotal: number;
  paidRemaining: number;
  entryCount: number;
  lastActivityAt: string | null;
  monthly: MonthlyPace[];
};

// Aggregated in SQL rather than by summing the already-fetched rows: the
// journal list is capped for display, but these totals must always reflect
// every row in the table.
export async function getRetainerSummary(): Promise<RetainerSummary> {
  const [config, startedOn, totals, paid, monthly] = await Promise.all([
    getRetainerConfig(),
    getRetainerStartDate(),
    sql()<{ hours: string | null; count: string; last: string | null }[]>`
      SELECT COALESCE(SUM(hours), 0) AS hours,
             COUNT(*) AS count,
             MAX(updated_at) AS last
      FROM retainer_entries
    `,
    sql()<{ amount: string | null }[]>`
      SELECT COALESCE(SUM(amount), 0) AS amount FROM retainer_payments
    `,
    sql()<{ month: string; hours: string }[]>`
      SELECT to_char(date_trunc('month', worked_on), 'YYYY-MM') AS month,
             SUM(hours) AS hours
      FROM retainer_entries
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);

  const totalHours = Number(config?.total_hours ?? 0);
  const totalAmount = Number(config?.total_amount ?? 0);
  const hoursUsed = Number(totals[0]?.hours ?? 0);
  const paidTotal = Number(paid[0]?.amount ?? 0);
  const hourlyRate = totalHours > 0 ? totalAmount / totalHours : 0;

  return {
    startedOn,
    totalHours,
    totalAmount,
    hourlyRate,
    hoursUsed,
    // Clamped at zero so an overrun reads as "0 remaining" plus an explicit
    // overage figure, rather than a confusing negative balance.
    hoursRemaining: Math.max(0, totalHours - hoursUsed),
    percentUsed: totalHours > 0 ? Math.min(100, (hoursUsed / totalHours) * 100) : 0,
    overageHours: Math.max(0, hoursUsed - totalHours),
    valueUsed: hoursUsed * hourlyRate,
    paidTotal,
    paidRemaining: Math.max(0, totalAmount - paidTotal),
    entryCount: Number(totals[0]?.count ?? 0),
    lastActivityAt: totals[0]?.last ?? null,
    monthly: monthly.map((m) => ({ month: m.month, hours: Number(m.hours) })),
  };
}
