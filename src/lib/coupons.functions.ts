import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { getValidCoupon } from "./coupons.server";
import { checkRateLimit } from "./rate-limit.server";

const ValidateCouponSchema = z.object({ code: z.string().trim().min(1).max(40) });

// Public — called from the checkout coupon-code field before payment, so
// the visitor sees the discount applied to the displayed total immediately.
// The discount is still recomputed and enforced server-side when the Sumit
// payment page is created (see createSumitPayment) — this call never
// determines what's actually charged. Rate-limited per IP since it's
// otherwise an unlimited-guess oracle against single-use per-lead codes and
// a cheap way to hammer the database.
export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ValidateCouponSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
    if (!checkRateLimit(`coupon:ip:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 })) {
      throw new Error("יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.");
    }
    const coupon = await getValidCoupon(data.code);
    if (!coupon) return { valid: false as const };
    return { valid: true as const, discount_percent: coupon.discount_percent };
  });
