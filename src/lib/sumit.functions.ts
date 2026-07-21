import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { createSumitPaymentPage, verifySumitTransaction } from "./sumit.server";
import { updateResendPaymentStatusByEmail } from "./resend.server";
import {
  recordOrder,
  markOrderStatus,
  getOrderPackages,
  isTransactionReusedElsewhere,
} from "./orders.server";
import { resolvePackageSessions } from "./schedule.server";
import { getValidCoupon, markCouponUsed } from "./coupons.server";
import { getCurrentPrices } from "./pricing.server";
import { isFreeCoreLesson } from "./core-lessons";
import { phoneSchema, idNumberSchema } from "./validators";
import { checkRateLimit } from "./rate-limit.server";

const CreatePaymentSchema = z.object({
  package_ids: z.array(z.string()).min(1),
  email: z.string().email().max(254),
  full_name: z.string().min(1).max(200),
  phone: phoneSchema,
  order_reference: z.string().min(1).max(100),
  id_number: idNumberSchema,
  core_single_lesson_indexes: z.array(z.number().int().min(1).max(8)).optional(),
  coupon_code: z.string().trim().max(40).optional(),
});

function applyDiscount(price: number, discountPercent: number): number {
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

export const createSumitPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreatePaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
    if (!checkRateLimit(`checkout:ip:${ip}`, { max: 20, windowMs: 30 * 60 * 1000 })) {
      throw new Error("יותר מדי ניסיונות תשלום. נסו שוב בעוד כמה דקות.");
    }

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
          // Lesson 8 ("פינוי מושכר") is free — no order/charge for it. Its
          // registration is already recorded via subscribeRegistration
          // (selected_packages + core_single_lesson_indexes), independent
          // of any order, same as the free open-webinar flow.
          if (isFreeCoreLesson(idx)) continue;
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
  orderReference: z.string().min(1),
});

// Called from the success page to guarantee status update even if the
// webhook was missed (network hiccup, tab closed before it lands, etc.).
// Recipient email, purchased package ids, and the applied coupon are always
// resolved from the order row recorded at checkout time (never from
// client-supplied params), and a transaction id already applied to a
// different order is refused — otherwise a real paid transaction id could
// be replayed to fraudulently confirm arbitrary other orders.
export const confirmSumitPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConfirmSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const order = await getOrderPackages(data.orderReference);
      if (!order) {
        return { paid: false, error: "order not found" };
      }

      let validation = await verifySumitTransaction(data.transactionId);
      if (validation.paid) {
        const reused = await isTransactionReusedElsewhere(data.transactionId, data.orderReference);
        if (reused) {
          console.error(
            "[confirmSumitPayment] transaction id already applied to a different order",
            data.transactionId,
            data.orderReference,
          );
          validation = {
            ...validation,
            paid: false,
            definitivelyFailed: true,
            status: "transaction_reused",
          };
        }
      }

      // Sumit's gettransaction endpoint has a real settlement lag right
      // after checkout completes — an unconfirmed result here doesn't mean
      // the payment failed, just that it isn't verifiable yet. Report
      // pending back to the caller (which keeps polling) instead of
      // emailing/marking the order failed on a guess.
      if (!validation.paid && !validation.definitivelyFailed) {
        return { paid: false, pending: true };
      }

      await updateResendPaymentStatusByEmail(
        order.email,
        validation.paid ? "שולם" : "נכשל",
        order.packageIds,
      );
      await markOrderStatus({
        orderReference: data.orderReference,
        transactionId: data.transactionId,
        status: validation.paid ? "paid" : "failed",
      });
      if (validation.paid && order.couponCode) {
        await markCouponUsed(order.couponCode);
      }
      return { paid: validation.paid };
    } catch (err) {
      // A thrown error here (network hiccup, Sumit rejecting the verify
      // call itself) means the outcome is unknown, not that the payment
      // failed — report pending so the caller keeps polling rather than
      // treating a transient error as a confirmed failure.
      console.error("[confirmSumitPayment] error", err);
      return { paid: false, pending: true, error: (err as Error).message };
    }
  });
