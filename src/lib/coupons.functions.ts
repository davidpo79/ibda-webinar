import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getValidCoupon } from "./coupons.server";

const ValidateCouponSchema = z.object({ code: z.string().trim().min(1) });

// Public — called from the checkout coupon-code field before payment, so
// the visitor sees the discount applied to the displayed total immediately.
// The discount is still recomputed and enforced server-side when the Sumit
// payment page is created (see createSumitPayment) — this call never
// determines what's actually charged.
export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ValidateCouponSchema.parse(input))
  .handler(async ({ data }) => {
    const coupon = await getValidCoupon(data.code);
    if (!coupon) return { valid: false as const };
    return { valid: true as const, discount_percent: coupon.discount_percent };
  });
