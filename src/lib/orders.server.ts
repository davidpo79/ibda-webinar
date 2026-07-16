import { sql } from "./db.server";
import {
  getAllSessions,
  currentSessionForGroup,
  candidateSessionsForPackage,
  pickCurrent,
} from "./schedule.server";
import type { Session, SessionType } from "./schedule.server";

export type OrderStatus = "created" | "paid" | "failed";

export type OrderRow = {
  id: string;
  order_reference: string;
  transaction_id: string | null;
  email: string;
  package_id: string;
  amount: string | null;
  status: OrderStatus;
  coupon_code: string | null;
  created_at: string;
  updated_at: string;
  session_title: string | null;
  session_starts_at: string | null;
};

type RawOrderRow = OrderRow & {
  session_key: string | null;
  session_type: SessionType | null;
};

// One row per (order_reference, package, session) — a single Sumit
// transaction that covers several packages (or several core_single lessons)
// at once produces several rows sharing the same order_reference, so the
// admin buyers table can show each product on its own line with its own
// session date, instead of one comma-joined row.
export async function recordOrder(input: {
  orderReference: string;
  email: string;
  packages: { packageId: string; amount: number; sessionId: string | null }[];
  couponCode?: string | null;
}): Promise<void> {
  for (const pkg of input.packages) {
    await sql()`
      INSERT INTO orders (order_reference, email, package_id, amount, session_id, coupon_code, status)
      VALUES (
        ${input.orderReference}, ${input.email.toLowerCase()}, ${pkg.packageId},
        ${pkg.amount}, ${pkg.sessionId}, ${input.couponCode ?? null}, 'created'
      )
      ON CONFLICT (order_reference, package_id, session_id) DO NOTHING
    `;
  }
}

// Sumit's accounting-document webhook event (fired alongside — sometimes
// instead of promptly resolving — the payment IPN) carries no order
// reference at all, only its own internal EntityID. This is how the
// webhook handler correlates that event back to the order the *first*
// IPN call already recorded a transaction_id for (see
// recordObservedTransactionId), so a second, later event for the same
// transaction can retry resolving an order the first attempt left
// ambiguous — instead of being silently dropped as "no identifiers".
export async function findOrderReferenceByTransactionId(
  transactionId: string,
): Promise<string | null> {
  const rows = await sql()<{ order_reference: string }[]>`
    SELECT order_reference FROM orders
    WHERE transaction_id = ${transactionId} AND status = 'created'
    LIMIT 1
  `;
  return rows[0]?.order_reference ?? null;
}

// Persists a transaction id onto an order the moment it's observed in a
// webhook/return call, independent of whether that call could actually
// resolve paid/failed. Without this, an order whose verify attempt comes
// back ambiguous (Sumit's gettransaction lagging) is left with no
// transaction_id at all, so the admin dashboard's real "אימות מול הסליקה"
// re-check has nothing to check against — the only recovery left is the
// blind "אישור ידני" override. COALESCE keeps this from clobbering a
// transaction_id a later, successful resolution already set.
export async function recordObservedTransactionId(
  orderReference: string,
  transactionId: string,
): Promise<void> {
  await sql()`
    UPDATE orders SET transaction_id = COALESCE(transaction_id, ${transactionId})
    WHERE order_reference = ${orderReference}
  `;
}

export async function markOrderStatus(input: {
  orderReference: string;
  transactionId?: string | null;
  status: OrderStatus;
}): Promise<void> {
  await sql()`
    UPDATE orders SET
      status = ${input.status},
      transaction_id = COALESCE(${input.transactionId ?? null}, transaction_id),
      updated_at = now()
    WHERE order_reference = ${input.orderReference}
  `;
}

// A transaction that covered several packages at once can still be stored
// as one row with a comma-joined package_id (from before per-package rows
// existed) — expand each such row into one line item per product here, so
// every consumer (the admin table, PACKAGE_LABELS lookups, the product
// filter) always sees a single clean package id. Each line item's session
// date is also re-resolved live against the current schedule rather than
// trusting the (possibly since-superseded) session_id pinned at purchase
// time, so it keeps tracking the next relevant cohort as dates pass. Pure
// (no DB access) so it's unit-testable independent of listOrders below.
export function buildOrderLineItems(rawRows: RawOrderRow[], sessions: Session[]): OrderRow[] {
  const items: OrderRow[] = [];
  for (const raw of rawRows) {
    const packageIds = raw.package_id
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const hasLinkedSession = raw.session_type !== null;

    packageIds.forEach((packageId, i) => {
      const session =
        packageIds.length === 1 && hasLinkedSession
          ? currentSessionForGroup(sessions, {
              key: raw.session_key,
              type: raw.session_type as SessionType,
            })
          : pickCurrent(candidateSessionsForPackage(packageId, sessions));
      items.push({
        id: packageIds.length > 1 ? `${raw.id}:${i}` : raw.id,
        order_reference: raw.order_reference,
        transaction_id: raw.transaction_id,
        email: raw.email,
        package_id: packageId,
        // Legacy combined rows don't carry a per-product price breakdown —
        // keep the transaction's total on its first line item only rather
        // than fabricating a split, and leave the rest blank.
        amount: i === 0 ? raw.amount : null,
        status: raw.status,
        coupon_code: raw.coupon_code,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        session_title: session?.title ?? null,
        session_starts_at: session?.starts_at ?? null,
      });
    });
  }
  // Two raw rows can share an order_reference (e.g. a legacy combined-package
  // row alongside a newer per-package one from the same checkout) without
  // being adjacent after the created_at sort above, if their timestamps
  // differ slightly. Stable-group by order_reference — keeping each group's
  // position at its first occurrence — so the admin table can always render
  // same-transaction line items as one visual block.
  const groups = new Map<string, OrderRow[]>();
  const order: string[] = [];
  for (const item of items) {
    if (!groups.has(item.order_reference)) {
      groups.set(item.order_reference, []);
      order.push(item.order_reference);
    }
    groups.get(item.order_reference)!.push(item);
  }
  return order.flatMap((ref) => groups.get(ref)!);
}

// Removes every line item sharing an order_reference (a multi-package or
// multi-lesson purchase can be several rows) — used from the admin
// dashboard to clear out test/duplicate orders. Does not touch coupons or
// the Resend contact.
export async function deleteOrder(orderReference: string): Promise<void> {
  await sql()`DELETE FROM orders WHERE order_reference = ${orderReference}`;
}

export async function listOrders(): Promise<OrderRow[]> {
  const [rawRows, sessions] = await Promise.all([
    sql()<RawOrderRow[]>`
      SELECT
        o.id, o.order_reference, o.transaction_id, o.email, o.package_id, o.amount,
        o.status, o.coupon_code, o.created_at, o.updated_at,
        s.title AS session_title, s.starts_at AS session_starts_at,
        s.key AS session_key, s.type AS session_type
      FROM orders o
      LEFT JOIN sessions s ON s.id = o.session_id
      ORDER BY o.created_at DESC
    `,
    getAllSessions(),
  ]);
  return buildOrderLineItems(rawRows, sessions);
}

// The single source of truth for "who bought what, and which coupon did
// they apply" for a given checkout — always derived from what was recorded
// server-side at createSumitPayment time, never from client-supplied query
// params on the payment-confirmation endpoints (sumit-return.ts,
// sumit-webhook.ts, confirmSumitPayment), which would otherwise let a caller
// claim a different recipient/package/coupon than what was actually bought.
export async function getOrderPackages(orderReference: string): Promise<{
  email: string;
  packageIds: string[];
  couponCode: string | null;
} | null> {
  const rows = await sql()<{ email: string; package_id: string; coupon_code: string | null }[]>`
    SELECT email, package_id, coupon_code FROM orders WHERE order_reference = ${orderReference}
  `;
  if (!rows.length) return null;
  return {
    email: rows[0].email,
    packageIds: Array.from(new Set(rows.map((r) => r.package_id))),
    couponCode: rows[0].coupon_code,
  };
}

// A single Sumit transaction id must never be used to mark more than one
// order_reference as paid — without this, one genuine (even low-value) paid
// transaction could be replayed against any number of forged orders, since
// verifySumitTransaction only confirms the id was paid *somewhere*, not that
// it belongs to the specific order being confirmed.
export async function isTransactionReusedElsewhere(
  transactionId: string,
  orderReference: string,
): Promise<boolean> {
  const rows = await sql()`
    SELECT 1 FROM orders
    WHERE transaction_id = ${transactionId}
      AND order_reference != ${orderReference}
      AND status = 'paid'
    LIMIT 1
  `;
  return rows.length > 0;
}
