// Simple in-process fixed-window rate limiter — resets on redeploy, which is
// an acceptable tradeoff for a single-instance app with no other rate
// limiting anywhere. Keyed by a caller-provided key (e.g. `${action}:${ip}`)
// so different endpoints/dimensions (per-IP, per-email) don't share a budget.
type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, opts: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > opts.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= opts.max;
}
