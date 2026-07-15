import { verifySumitTransaction, getSumitDocumentDetails } from "./sumit.server";
import { updateResendPaymentStatusByEmail } from "./resend.server";
import {
  getOrderPackages,
  isTransactionReusedElsewhere,
  markOrderStatus,
  findOrderReferenceByTransactionId,
} from "./orders.server";
import { markCouponUsed } from "./coupons.server";
import {
  listUnresolvedWebhookLogs,
  markWebhookLogOutcome,
  bumpWebhookLogAttempts,
} from "./sumit-webhook-log.server";

// A row that's been retried this many times without resolving is treated as
// permanently unresolvable — visible in the admin webhook log for manual
// triage (the "אישור ידני" button), but no longer worth spending Sumit API
// calls retrying automatically.
const MAX_RECONCILE_ATTEMPTS = 6;
// Webhook calls older than this are almost never going to resolve
// differently than they already have — the matching/verification logic
// doesn't change over time, only Sumit's own settlement state does, and
// that settles within minutes, not days.
const RECONCILE_WINDOW_HOURS = 48;

// Retries every not-yet-resolved logged webhook call against Sumit, and
// fires the same paid/failed pipeline the live webhook handler would have —
// this is what turns "the webhook call that happened to fail resolving
// stays stuck forever" into "it resolves automatically within the next
// sweep tick or two". Safe to call repeatedly/concurrently: markOrderStatus
// and the Resend/coupon updates are themselves idempotent, and each row is
// only re-attempted up to MAX_RECONCILE_ATTEMPTS times.
export async function runSumitWebhookReconcileSweep(): Promise<{
  scanned: number;
  recovered: number;
  errors: number;
}> {
  const rows = await listUnresolvedWebhookLogs(RECONCILE_WINDOW_HOURS, MAX_RECONCILE_ATTEMPTS);
  let recovered = 0;
  let errors = 0;
  const touchedIds: string[] = [];

  for (const row of rows) {
    touchedIds.push(row.id);
    if (!row.transaction_id) continue;

    try {
      // A log row can predate the order reference ever being resolved (e.g.
      // an accounting-document event that arrived before any IPN did) — try
      // once more here, since a later webhook call may have since recorded
      // it, before falling back to asking Sumit directly for the document.
      let orderReference = row.order_reference;
      if (!orderReference) {
        orderReference = await findOrderReferenceByTransactionId(row.transaction_id);
      }
      if (!orderReference) {
        const details = await getSumitDocumentDetails(row.transaction_id).catch(() => null);
        orderReference = details?.externalIdentifier ?? null;
      }
      if (!orderReference) continue;

      const order = await getOrderPackages(orderReference);
      if (!order) continue;

      const validation = await verifySumitTransaction(row.transaction_id);
      if (!validation.paid && !validation.definitivelyFailed) continue; // still ambiguous — retry next tick

      if (validation.paid) {
        const reused = await isTransactionReusedElsewhere(row.transaction_id, orderReference);
        if (reused) {
          await markWebhookLogOutcome(row.id, "transaction_reused");
          continue;
        }
      }

      await updateResendPaymentStatusByEmail(
        order.email,
        validation.paid ? "שולם" : "נכשל",
        order.packageIds,
      );
      await markOrderStatus({
        orderReference,
        transactionId: row.transaction_id,
        status: validation.paid ? "paid" : "failed",
      });
      if (validation.paid && order.couponCode) {
        await markCouponUsed(order.couponCode);
      }
      await markWebhookLogOutcome(row.id, validation.paid ? "paid" : "failed");
      if (validation.paid) recovered++;
    } catch (err) {
      errors++;
      console.error("[sumit-reconcile] row failed", row.id, err);
    }
  }

  if (touchedIds.length) await bumpWebhookLogAttempts(touchedIds);
  return { scanned: rows.length, recovered, errors };
}
