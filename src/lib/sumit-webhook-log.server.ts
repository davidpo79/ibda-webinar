import { sql } from "./db.server";

export type SumitWebhookLogRow = {
  id: string;
  received_at: string;
  transaction_id: string | null;
  order_reference: string | null;
  raw_body: string;
  parsed_payload: string | null;
  outcome: string | null;
  reconcile_attempts: number;
};

// Called once per webhook call that passes the signature check, regardless
// of whether it can be resolved — see the table comment in schema.sql.
export async function logSumitWebhookEvent(input: {
  transactionId: string | null;
  orderReference: string | null;
  rawBody: string;
  parsedPayload: Record<string, unknown>;
}): Promise<string> {
  const rows = await sql()<{ id: string }[]>`
    INSERT INTO sumit_webhook_log (transaction_id, order_reference, raw_body, parsed_payload)
    VALUES (
      ${input.transactionId}, ${input.orderReference},
      ${input.rawBody}, ${JSON.stringify(input.parsedPayload)}
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function markWebhookLogOutcome(id: string, outcome: string): Promise<void> {
  await sql()`UPDATE sumit_webhook_log SET outcome = ${outcome} WHERE id = ${id}`;
}

// Rows the reconcile sweep should retry: recent enough to still matter,
// not already resolved to a terminal outcome, and under the per-row retry
// cap (an orphaned call that's been retried this many times without
// resolving is treated as permanently unresolvable — visible in the admin
// log for manual triage, but no longer worth spending API calls retrying).
export async function listUnresolvedWebhookLogs(
  hoursBack: number,
  maxAttempts: number,
): Promise<SumitWebhookLogRow[]> {
  return sql()<SumitWebhookLogRow[]>`
    SELECT id, received_at, transaction_id, order_reference, raw_body, parsed_payload,
      outcome, reconcile_attempts
    FROM sumit_webhook_log
    WHERE received_at >= now() - (${hoursBack} || ' hours')::interval
      AND reconcile_attempts < ${maxAttempts}
      AND outcome IS DISTINCT FROM 'paid'
      AND outcome IS DISTINCT FROM 'failed'
      AND outcome IS DISTINCT FROM 'transaction_reused'
      AND outcome IS DISTINCT FROM 'no_identifiers'
    ORDER BY received_at DESC
    LIMIT 200
  `;
}

export async function bumpWebhookLogAttempts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = sql();
  await db`
    UPDATE sumit_webhook_log SET reconcile_attempts = reconcile_attempts + 1
    WHERE id IN ${db(ids)}
  `;
}

export async function listRecentWebhookLogs(limit: number): Promise<SumitWebhookLogRow[]> {
  return sql()<SumitWebhookLogRow[]>`
    SELECT id, received_at, transaction_id, order_reference, raw_body, parsed_payload,
      outcome, reconcile_attempts
    FROM sumit_webhook_log
    ORDER BY received_at DESC
    LIMIT ${limit}
  `;
}
