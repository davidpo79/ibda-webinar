// Meta (Facebook) pixel — browser side.
//
// Every conversion event is sent twice: once from here through the pixel,
// and once from the server through the Conversions API (see meta.server.ts).
// Both carry the same `event_id`, which is how Meta collapses the pair back
// into a single conversion instead of counting it twice. Sending only the
// browser copy loses every visitor with an ad blocker or ITP; sending only
// the server copy loses the browser signals (fbp/fbc cookies, referrer)
// that attribution is built on. The pair is the point.

export const META_PIXEL_ID = "4359265161008480";
export const META_CURRENCY = "ILS";

// Hebrew product names, mirrored from BROADCAST_PACKAGE_LABELS in
// broadcast.server.ts. Duplicated rather than imported because that module
// pulls in the database client and must never reach the browser bundle.
export const META_PACKAGE_LABELS: Record<string, string> = {
  open: "וובינר פתוח",
  core_full: "הסדרה המלאה",
  core_single: "וובינר בודד",
  premium_litigation: "סדנת ליטיגציה",
  premium_registration: "סדנת רישום בית משותף",
  premium_partnership: "סדנת שיתוף במקרקעין",
  premium_ai: "סדנת AI ואוטומציות",
  premium_bundle: "חבילת פרימיום",
};

export function packageLabel(id: string): string {
  return META_PACKAGE_LABELS[id] ?? id;
}

export type MetaContent = { id: string; quantity: number; item_price: number };

export type MetaCustomData = {
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  content_type?: string;
  contents?: MetaContent[];
  num_items?: number;
  value?: number;
  currency?: string;
  [key: string]: unknown;
};

// Raw (unhashed) identifiers. The pixel hashes these itself before they
// leave the browser when they are handed to fbq('init', ...); the server
// hashes its own copy in meta.server.ts. Never send these anywhere else.
export type MetaUserData = {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  external_id?: string;
};

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[] };

function fbq(): Fbq | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { fbq?: Fbq }).fbq;
}

export function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function trackMeta(
  eventName: string,
  customData: MetaCustomData = {},
  eventId?: string,
): void {
  const f = fbq();
  if (!f) return;
  try {
    f("track", eventName, customData, eventId ? { eventID: eventId } : undefined);
  } catch (err) {
    console.warn("[meta] pixel track failed", eventName, err);
  }
}

// Re-initialising the pixel with identifiers is Meta's documented way to
// turn on advanced matching mid-session: the values are hashed inside the
// pixel and attached to every subsequent event, which is what lifts match
// quality from "browser cookie only" to "person". Called the moment a form
// is submitted, just before the event that follows it.
export function identifyMeta(user: MetaUserData): void {
  const f = fbq();
  if (!f) return;
  const clean: Record<string, string> = {};
  if (user.em) clean.em = user.em.trim().toLowerCase();
  if (user.ph) clean.ph = user.ph.replace(/\D/g, "");
  if (user.fn) clean.fn = user.fn.trim().toLowerCase();
  if (user.ln) clean.ln = user.ln.trim().toLowerCase();
  if (user.external_id) clean.external_id = user.external_id;
  if (!Object.keys(clean).length) return;
  try {
    f("init", META_PIXEL_ID, clean);
  } catch (err) {
    console.warn("[meta] advanced matching init failed", err);
  }
}

function cookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// The two browser cookies the Conversions API needs in order to attribute a
// server event to the ad that produced it. `_fbc` is normally written by the
// pixel from the ?fbclid= on the landing URL, but when the pixel is blocked
// it never gets written — so rebuild it from the click id ourselves, in the
// `fb.1.<timestamp>.<fbclid>` format Meta expects.
export function fbCookies(): { fbp?: string; fbc?: string } {
  const fbp = cookie("_fbp");
  let fbc = cookie("_fbc");
  if (!fbc && typeof window !== "undefined") {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  }
  return { fbp, fbc };
}

export function eventSourceUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.href;
}

// The base pixel snippet, rendered into <head> so it loads before anything
// else on the page. Kept as a string (rather than a <script src>) because
// Meta's loader has to define the fbq queue synchronously — an async module
// would drop every event fired before it resolved.
export const META_PIXEL_SNIPPET = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');
fbq('track','PageView');`;
