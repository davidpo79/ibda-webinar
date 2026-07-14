import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSumitPaymentPage, verifySumitTransaction } from "./sumit.server";
import { updateResendPaymentStatusByEmail } from "./resend.server";
import { recordOrder } from "./orders.server";
import { resolvePackageSessions } from "./schedule.server";
import { getValidCoupon, markCouponUsed } from "./coupons.server";
import { getCurrentPrices } from "./pricing.server";

const CreatePaymentSchema = z.object({
  package_ids: z.array(z.string()).min(1),
  email: z.string().email(),
  full_name: z.string().min(1),
  phone: z.string().min(1),
  order_reference: z.string().min(1),
  id_number: z.string().trim().min(5, "מספר ת.ז / ח.פ לא תקין"),
  core_single_lesson_indexes: z.array(z.number().int().min(1).max(9)).optional(),
  coupon_code: z.string().trim().optional(),
});

function applyDiscount(price: number, discountPercent: number): number {
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

export const createSumitPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreatePaymentSchema.parse(input))
  .handler(async ({ data }) => {
    let discountPercent = 0;
    let couponCode: string | null = null;
    if (data.coupon_code) {
      const coupon = await getValidCoupon(data.coupon_code);
      if (coupon) {
        discountPercent = coupon.discount_percent;
        couponCode = coupon.code;
      }
    }

    let result: Awaited<ReturnType<typeof createSumitPaymentPage>>;
    try {
      result = await createSumitPaymentPage({
        ...data,
        discount_percent: discountPercent,
        coupon_code: couponCode ?? undefined,
      });
    } catch (err) {
      console.error("[createSumitPayment] failed", data.package_ids, data.order_reference, err);
      throw err;
    }

    const prices = await getCurrentPrices();
    const lessons = data.core_single_lesson_indexes ?? [];
    const packages: { packageId: string; amount: number; sessionId: string | null }[] = [];

    for (const id of data.package_ids) {
      if (id === "core_single" && lessons.length > 0) {
        for (const idx of lessons) {
          const amount = applyDiscount(prices.core_single ?? 0, discountPercent);
          const resolved = await resolvePackageSessions("core_single", [idx]);
          const sessionId = resolved.kind === "single" ? (resolved.session?.id ?? null) : null;
          packages.push({ packageId: "core_single", amount, sessionId });
        }
        continue;
      }
      const amount = applyDiscount(prices[id] ?? 0, discountPercent);
      const resolved = await resolvePackageSessions(id);
      const sessionId =
        resolved.kind === "single" ? (resolved.session?.id ?? null) : (resolved.anchor?.id ?? null);
      packages.push({ packageId: id, amount, sessionId });
    }

    await recordOrder({
      orderReference: data.order_reference,
      email: data.email,
      packages,
      couponCode,
    });
    return result;
  });

const ConfirmSchema = z.object({
  transactionId: z.string().min(1),
  email: z.string().email(),
  // Comma-joined package ids for a multi-package purchase (see CreatePaymentSchema).
  package_id: z.string().optional(),
  coupon_code: z.string().optional(),
});

// Called from the success page to guarantee status update even if the
// webhook was missed (network hiccup, tab closed before it lands, etc.).
export const confirmSumitPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConfirmSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const validation = await verifySumitTransaction(data.transactionId);
      const packageIds = data.package_id ? data.package_id.split(",").filter(Boolean) : [];
      await updateResendPaymentStatusByEmail(
        data.email,
        validation.paid ? "שולם" : "נכשל",
        packageIds,
      );
      if (validation.paid && data.coupon_code) {
        await markCouponUsed(data.coupon_code);
      }
      return { paid: validation.paid };
    } catch (err) {
      console.error("[confirmSumitPayment] error", err);
      return { paid: false, error: (err as Error).message };
    }
  });
