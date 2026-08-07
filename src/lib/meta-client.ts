import { useEffect, useRef } from "react";
import {
  META_CURRENCY,
  type MetaContent,
  fbCookies,
  eventSourceUrl,
  identifyMeta,
  newEventId,
  trackMeta,
} from "./meta";
import { trackMetaConversion } from "./meta.functions";

// The call sites' view of Meta tracking. Each helper fires the browser
// pixel and, for the two conversion events that matter, the server mirror
// with the same event_id (see meta.functions.ts for why the pair exists).
//
// Nothing here is allowed to throw. Analytics that can break a registration
// form is worse than no analytics.

type Person = {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
};

// The server mirror is raised while the page is often about to navigate
// away (to /thank-you, or out to Sumit). Waiting for it unbounded would add
// the round trip to every checkout; not waiting at all would lose the event
// to the navigation. Wait, but never for long.
async function mirror(payload: Record<string, unknown>): Promise<void> {
  try {
    await Promise.race([
      trackMetaConversion({ data: payload as never }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch (err) {
    console.warn("[meta] server mirror failed", err);
  }
}

function person(p: Person) {
  return {
    ...(p.email ? { email: p.email.trim().toLowerCase() } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.first_name ? { first_name: p.first_name } : {}),
    ...(p.last_name ? { last_name: p.last_name } : {}),
  };
}

export type ViewContentInput = {
  content_ids: string[];
  content_name: string;
  content_category?: string;
  value?: number;
};

// Browser only. ViewContent is the highest-volume event on the site and
// carries no identifiers, so a server copy would cost a lot and add nothing.
export function trackViewContent(input: ViewContentInput): void {
  trackMeta(
    "ViewContent",
    {
      content_type: "product",
      content_ids: input.content_ids,
      content_name: input.content_name,
      ...(input.content_category ? { content_category: input.content_category } : {}),
      ...(input.value !== undefined ? { value: input.value, currency: META_CURRENCY } : {}),
    },
    newEventId(),
  );
}

// Fires once per mount. StrictMode double-invokes effects in development,
// which would otherwise report every page view twice.
export function useViewContent(input: ViewContentInput): void {
  const fired = useRef(false);
  const contentKey = input.content_ids.join(",");
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackViewContent(input);
    // Re-firing on every render of a page whose props change (prices
    // loading in, for instance) is not wanted — the content identity is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);
}

export type LeadInput = Person & {
  content_ids: string[];
  content_name: string;
  content_category?: string;
  value?: number;
};

// Someone handed over their contact details. On the free open webinar this
// is the conversion the campaign optimises for, so it is worth the full
// browser + server treatment and the strongest match signals available.
export async function trackLead(input: LeadInput): Promise<void> {
  const eventId = newEventId();
  const { fbp, fbc } = fbCookies();
  if (input.email) {
    identifyMeta({
      em: input.email,
      ph: input.phone,
      fn: input.first_name,
      ln: input.last_name,
      external_id: input.email.trim().toLowerCase(),
    });
  }
  trackMeta(
    "Lead",
    {
      content_type: "product",
      content_ids: input.content_ids,
      content_name: input.content_name,
      ...(input.content_category ? { content_category: input.content_category } : {}),
      ...(input.value !== undefined ? { value: input.value, currency: META_CURRENCY } : {}),
    },
    eventId,
  );
  await mirror({
    event_name: "Lead",
    event_id: eventId,
    event_source_url: eventSourceUrl(),
    ...person(input),
    fbp,
    fbc,
    content_ids: input.content_ids,
    content_name: input.content_name,
    ...(input.content_category ? { content_category: input.content_category } : {}),
    ...(input.value !== undefined ? { value: input.value, currency: META_CURRENCY } : {}),
  });
}

export type InitiateCheckoutInput = Person & {
  order_reference: string;
  content_ids: string[];
  content_name: string;
  contents: MetaContent[];
  num_items: number;
  value: number;
};

// The last event raised while a browser is still present — the next thing
// that happens is a redirect to Sumit's hosted payment page. Purchase is
// raised much later, server side, from the payment webhook.
export async function trackInitiateCheckout(input: InitiateCheckoutInput): Promise<void> {
  const eventId = newEventId();
  const { fbp, fbc } = fbCookies();
  if (input.email) {
    identifyMeta({
      em: input.email,
      ph: input.phone,
      fn: input.first_name,
      ln: input.last_name,
      external_id: input.email.trim().toLowerCase(),
    });
  }
  trackMeta(
    "InitiateCheckout",
    {
      content_type: "product",
      content_ids: input.content_ids,
      content_name: input.content_name,
      contents: input.contents,
      num_items: input.num_items,
      value: input.value,
      currency: META_CURRENCY,
      order_id: input.order_reference,
    },
    eventId,
  );
  await mirror({
    event_name: "InitiateCheckout",
    event_id: eventId,
    event_source_url: eventSourceUrl(),
    order_reference: input.order_reference,
    ...person(input),
    fbp,
    fbc,
    content_ids: input.content_ids,
    content_name: input.content_name,
    contents: input.contents,
    num_items: input.num_items,
    value: input.value,
    currency: META_CURRENCY,
  });
}
