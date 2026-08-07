import { createHash } from "node:crypto";
import { sql } from "./db.server";
import { META_PIXEL_ID, META_CURRENCY, packageLabel } from "./meta";

// Meta Conversions API — the server half of the pixel.
//
// Two jobs here:
//
// 1. Mirror the browser events (Lead, InitiateCheckout) with the same
//    event_id, so a blocked or crashed pixel doesn't lose the conversion.
// 2. Own Purchase outright. Payment completes on Sumit's hosted page, not
//    on this site, and /payment/success has a documented "pending" state
//    where the browser genuinely cannot tell whether the charge went
//    through. A browser-side Purchase would therefore fire late, fire on
//    unverified state, or not fire at all. The only moment this system
//    *knows* a payment is real is when Sumit's signature-verified webhook
//    (or the verify fallback) resolves it — so that is where Purchase is
//    sent from.

const GRAPH_VERSION = "v21.0";

function accessToken(): string | undefined {
  return process.env.META_CAPI_ACCESS_TOKEN?.trim() || undefined;
}

function pixelId(): string {
  return process.env.META_PIXEL_ID?.trim() || META_PIXEL_ID;
}

let missingTokenWarned = false;

function hash(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  return createHash("sha256").update(trimmed, "utf8").digest("hex");
}

// Meta matches phone numbers in E.164 without the leading "+". Israeli
// numbers arrive as 05X-XXXXXXX, which hashes to nothing useful unless the
// local 0 is swapped for the 972 country code first.
export function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;
  return digits;
}

export type MetaUserInput = {
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  client_ip_address?: string | null;
  client_user_agent?: string | null;
};

// Everything identifying is SHA-256'd here, in this process, before it ever
// leaves the server. fbp/fbc/ip/user-agent are the documented exceptions:
// Meta requires those raw.
function buildUserData(user: MetaUserInput): Record<string, unknown> {
  const email = user.email?.trim().toLowerCase();
  const out: Record<string, unknown> = {};
  if (email) {
    out.em = [hash(email)];
    // A stable pseudonymous id lets Meta stitch a visitor's Lead and
    // Purchase together even when the two events carry different cookies.
    out.external_id = [hash(email)];
  }
  const phone = normalizePhone(user.phone);
  if (phone) out.ph = [hash(phone)];
  if (user.first_name) out.fn = [hash(user.first_name)];
  if (user.last_name) out.ln = [hash(user.last_name)];
  // Everyone in this funnel is an Israeli lawyer; a constant country is
  // still a real match signal and costs nothing.
  out.country = [hash("il")];
  if (user.fbp) out.fbp = user.fbp;
  if (user.fbc) out.fbc = user.fbc;
  if (user.client_ip_address) out.client_ip_address = user.client_ip_address;
  if (user.client_user_agent) out.client_user_agent = user.client_user_agent;
  return out;
}

export type MetaEventInput = {
  event_name: string;
  event_id: string;
  event_time?: number;
  event_source_url?: string | null;
  action_source?: "website" | "system_generated";
  user: MetaUserInput;
  custom_data?: Record<string, unknown>;
};

// Never throws. A tracking failure must not be able to fail a registration,
// a checkout, or a webhook acknowledgement — the worst acceptable outcome
// is a missing row in Events Manager, not a lost sale.
export async function sendMetaEvent(input: MetaEventInput): Promise<void> {
  const token = accessToken();
  if (!token) {
    if (!missingTokenWarned) {
      missingTokenWarned = true;
      console.warn("[meta] META_CAPI_ACCESS_TOKEN is not set — server events are disabled");
    }
    return;
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: input.event_name,
        event_id: input.event_id,
        event_time: input.event_time ?? Math.floor(Date.now() / 1000),
        action_source: input.action_source ?? "website",
        ...(input.event_source_url ? { event_source_url: input.event_source_url } : {}),
        user_data: buildUserData(input.user),
        ...(input.custom_data ? { custom_data: input.custom_data } : {}),
      },
    ],
  };
  // Set only while wiring things up, from Events Manager > Test Events.
  // Leaving it set in production diverts real events into the test stream.
  const testCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (testCode) payload.test_event_code = testCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId()}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      console.error("[meta] CAPI rejected", input.event_name, res.status, await res.text());
    }
  } catch (err) {
    console.error("[meta] CAPI request failed", input.event_name, err);
  }
}

// ---------------------------------------------------------------------------
// Attribution carried across the Sumit round trip
// ---------------------------------------------------------------------------

export type MetaAttribution = {
  fbp: string | null;
  fbc: string | null;
  client_ip_address: string | null;
  client_user_agent: string | null;
  event_source_url: string | null;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
};

// The buyer leaves the site for Sumit's payment page and the Purchase event
// is raised much later, from a webhook that has no browser attached to it.
// Snapshot the browser's attribution here, at checkout, keyed on the order
// reference, so the eventual Purchase can still be tied to the ad click.
export async function saveMetaAttribution(
  orderReference: string,
  attr: Partial<MetaAttribution>,
): Promise<void> {
  try {
    await sql()`
      INSERT INTO meta_attribution (
        order_reference, fbp, fbc, client_ip_address, client_user_agent,
        event_source_url, email, phone, first_name, last_name
      ) VALUES (
        ${orderReference}, ${attr.fbp ?? null}, ${attr.fbc ?? null},
        ${attr.client_ip_address ?? null}, ${attr.client_user_agent ?? null},
        ${attr.event_source_url ?? null}, ${attr.email?.toLowerCase() ?? null},
        ${attr.phone ?? null}, ${attr.first_name ?? null}, ${attr.last_name ?? null}
      )
      ON CONFLICT (order_reference) DO UPDATE SET
        fbp = COALESCE(EXCLUDED.fbp, meta_attribution.fbp),
        fbc = COALESCE(EXCLUDED.fbc, meta_attribution.fbc),
        client_ip_address = COALESCE(EXCLUDED.client_ip_address, meta_attribution.client_ip_address),
        client_user_agent = COALESCE(EXCLUDED.client_user_agent, meta_attribution.client_user_agent),
        event_source_url = COALESCE(EXCLUDED.event_source_url, meta_attribution.event_source_url),
        email = COALESCE(EXCLUDED.email, meta_attribution.email),
        phone = COALESCE(EXCLUDED.phone, meta_attribution.phone),
        first_name = COALESCE(EXCLUDED.first_name, meta_attribution.first_name),
        last_name = COALESCE(EXCLUDED.last_name, meta_attribution.last_name)
    `;
  } catch (err) {
    console.error("[meta] saving attribution failed", orderReference, err);
  }
}

// Claims the right to send exactly one Purchase for this order. Four
// separate paths can mark an order paid (the Sumit webhook, the browser
// return confirm, the reconcile sweep, and the admin manual override) and
// several of them routinely fire for the same order — without this claim,
// one sale would be reported as three or four, wrecking ROAS.
async function claimPurchaseSend(orderReference: string): Promise<MetaAttribution | null> {
  await sql()`
    INSERT INTO meta_attribution (order_reference) VALUES (${orderReference})
    ON CONFLICT (order_reference) DO NOTHING
  `;
  const rows = await sql()<MetaAttribution[]>`
    UPDATE meta_attribution SET purchase_sent_at = now()
    WHERE order_reference = ${orderReference} AND purchase_sent_at IS NULL
    RETURNING fbp, fbc, client_ip_address, client_user_agent, event_source_url,
              email, phone, first_name, last_name
  `;
  return rows[0] ?? null;
}

// The single Purchase entry point. Safe (and expected) to call from every
// path that resolves an order to paid — the claim above makes repeat calls
// no-ops.
export async function sendMetaPurchase(orderReference: string): Promise<void> {
  if (!accessToken()) return;
  try {
    const rows = await sql()<{ email: string; package_id: string; amount: string | null }[]>`
      SELECT email, package_id, amount FROM orders
      WHERE order_reference = ${orderReference} AND status = 'paid'
    `;
    if (!rows.length) return;

    const attr = await claimPurchaseSend(orderReference);
    if (!attr) return; // already reported

    const value = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    const counts = new Map<string, { quantity: number; item_price: number }>();
    for (const r of rows) {
      const existing = counts.get(r.package_id);
      if (existing) existing.quantity += 1;
      else counts.set(r.package_id, { quantity: 1, item_price: Number(r.amount ?? 0) });
    }
    const contentIds = Array.from(counts.keys());

    await sendMetaEvent({
      event_name: "Purchase",
      // Deterministic in the order reference, so even a Purchase somehow
      // sent from two processes at once collapses into one conversion.
      event_id: `purchase-${orderReference}`,
      event_source_url: attr.event_source_url,
      user: {
        email: attr.email ?? rows[0].email,
        phone: attr.phone,
        first_name: attr.first_name,
        last_name: attr.last_name,
        fbp: attr.fbp,
        fbc: attr.fbc,
        client_ip_address: attr.client_ip_address,
        client_user_agent: attr.client_user_agent,
      },
      custom_data: {
        currency: META_CURRENCY,
        value,
        content_type: "product",
        content_ids: contentIds,
        content_name: contentIds.map(packageLabel).join(", "),
        contents: Array.from(counts.entries()).map(([id, c]) => ({
          id,
          quantity: c.quantity,
          item_price: c.item_price,
        })),
        num_items: rows.length,
        order_id: orderReference,
      },
    });
  } catch (err) {
    console.error("[meta] Purchase send failed", orderReference, err);
  }
}
