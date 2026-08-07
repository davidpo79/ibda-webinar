import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { sendMetaEvent, saveMetaAttribution } from "./meta.server";
import { checkRateLimit } from "./rate-limit.server";

// Server-side mirror of the browser pixel's conversion events. The browser
// fires the event and then calls this with the *same* event_id; Meta
// deduplicates the pair and keeps whichever arrives first. That way an ad
// blocker, a closed tab mid-redirect, or Safari's tracking prevention costs
// attribution rather than the conversion itself.
//
// Deliberately not mirrored: PageView and ViewContent. They are high volume,
// carry no identifiers worth matching on, and doubling them would spend the
// event budget without improving optimisation.

const ContentSchema = z.object({
  id: z.string().max(60),
  quantity: z.number().int().min(1).max(50),
  item_price: z.number().min(0).max(1_000_000),
});

const TrackSchema = z.object({
  event_name: z.enum(["Lead", "InitiateCheckout"]),
  event_id: z.string().min(1).max(80),
  event_source_url: z.string().url().max(500).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(30).optional(),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  fbp: z.string().max(120).optional(),
  fbc: z.string().max(255).optional(),
  order_reference: z.string().max(100).optional(),
  content_ids: z.array(z.string().max(60)).max(20).optional(),
  content_name: z.string().max(300).optional(),
  content_category: z.string().max(100).optional(),
  contents: z.array(ContentSchema).max(20).optional(),
  num_items: z.number().int().min(0).max(100).optional(),
  value: z.number().min(0).max(1_000_000).optional(),
  currency: z.string().length(3).optional(),
});

export const trackMetaConversion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TrackSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
    // Generous enough that a real visitor filling in several forms is never
    // blocked, tight enough that the endpoint can't be used to spray junk
    // conversions into the ad account.
    if (!checkRateLimit(`meta:ip:${ip}`, { max: 60, windowMs: 10 * 60 * 1000 })) {
      return { ok: false };
    }

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    const clientIp = ip === "unknown" ? null : ip;

    // InitiateCheckout is the last moment a browser is present before the
    // buyer is handed to Sumit, so it is also where the click identifiers
    // get snapshotted for the Purchase event that follows minutes later.
    if (data.event_name === "InitiateCheckout" && data.order_reference) {
      await saveMetaAttribution(data.order_reference, {
        fbp: data.fbp,
        fbc: data.fbc,
        client_ip_address: clientIp,
        client_user_agent: userAgent,
        event_source_url: data.event_source_url,
        email: data.email,
        phone: data.phone,
        first_name: data.first_name,
        last_name: data.last_name,
      });
    }

    await sendMetaEvent({
      event_name: data.event_name,
      event_id: data.event_id,
      event_source_url: data.event_source_url,
      user: {
        email: data.email,
        phone: data.phone,
        first_name: data.first_name,
        last_name: data.last_name,
        fbp: data.fbp,
        fbc: data.fbc,
        client_ip_address: clientIp,
        client_user_agent: userAgent,
      },
      custom_data: {
        ...(data.content_ids ? { content_ids: data.content_ids, content_type: "product" } : {}),
        ...(data.content_name ? { content_name: data.content_name } : {}),
        ...(data.content_category ? { content_category: data.content_category } : {}),
        ...(data.contents ? { contents: data.contents } : {}),
        ...(data.num_items !== undefined ? { num_items: data.num_items } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.order_reference ? { order_id: data.order_reference } : {}),
      },
    });

    return { ok: true };
  });
