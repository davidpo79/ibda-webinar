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
  created_at: string;
  updated_at: string;
};

// One row per purchase attempt, keyed by order_reference — not by email —
// so a customer buying two different packages at different times shows up
// as two separate rows, never merged/deduped by contact identity.
export async function recordOrder(input: {
  orderReference: string;
  email: string;
  packageId: string;
  amount: number;
}): Promise<void> {
  await sql()`
    INSERT INTO orders (order_reference, email, package_id, amount, status)
    VALUES (${input.orderReference}, ${input.email.toLowerCase()}, ${input.packageId}, ${input.amount}, 'created')
    ON CONFLICT (order_reference) DO NOTHING
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

export async function listOrders(): Promise<OrderRow[]> {
  return sql()<OrderRow[]>`
    SELECT id, order_reference, transaction_id, email, package_id, amount, status, created_at, updated_at
    FROM orders
    ORDER BY created_at DESC
  `;
}
