// Shared between the live webhook handler (sumit-webhook.ts) and the
// periodic reconciliation sweep (sumit-reconcile.server.ts) — both need to
// recognize the same Sumit payload shapes the same way.

export type SumitWebhookIdentifiers = {
  transactionId: string | null;
  orderReference: string | null;
};

// The payment IPN's own identifiers — {TransactionID|ChargeID|documentid,
// ExternalIdentifier|orderRef|order_reference, ...}.
export function extractSumitIdentifiers(payload: Record<string, unknown>): SumitWebhookIdentifiers {
  const transactionId =
    String(payload.TransactionID || payload.ChargeID || payload.documentid || "") || null;
  const orderReference =
    String(payload.ExternalIdentifier || payload.orderRef || payload.order_reference || "") || null;
  return { transactionId, orderReference };
}

// Sumit sends (at least) two distinct webhook shapes for the same
// redirect-flow checkout: the payment IPN (handled by extractSumitIdentifiers
// above) and a separate accounting-document creation event ({Folder,
// EntityID, Type, Properties, ...}, arriving form-encoded as a single "json"
// field) that carries none of our identifiers, only Sumit's own EntityID for
// the document — which is the same id as the payment IPN's
// documentid/transactionId. Recognizing this shape lets a stuck order get a
// second shot at resolving via whatever transaction id the first IPN
// recorded (or, failing that, via a direct Sumit document lookup — see
// getSumitDocumentDetails in sumit.server.ts).
export function extractSumitEventTransactionId(payload: Record<string, unknown>): string | null {
  const direct = payload as { EntityID?: unknown; Folder?: unknown };
  if (direct.EntityID != null && direct.Folder != null) return String(direct.EntityID);
  if (typeof payload.json === "string") {
    try {
      const inner = JSON.parse(payload.json) as { EntityID?: unknown; Folder?: unknown };
      if (inner.EntityID != null && inner.Folder != null) return String(inner.EntityID);
    } catch {
      // not the shape we're looking for — caller falls back to "no identifiers"
    }
  }
  return null;
}
