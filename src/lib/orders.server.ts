import { sql } from "./db.server";

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

export async function listOrders(): Promise<OrderRow[]> {
  return sql()<OrderRow[]>`
    SELECT
      o.id, o.order_reference, o.transaction_id, o.email, o.package_id, o.amount,
      o.status, o.coupon_code, o.created_at, o.updated_at,
      s.title AS session_title, s.starts_at AS session_starts_at
    FROM orders o
    LEFT JOIN sessions s ON s.id = o.session_id
    ORDER BY o.created_at DESC
  `;
}
