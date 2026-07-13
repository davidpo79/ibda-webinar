import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createSumitPaymentPage,
  markSumitOrder,
  resolveSumitOrder,
  verifySumitTransaction,
} from "./sumit.server";
import { updateResendPaymentStatusByEmail } from "./resend.server";

const CreatePaymentSchema = z.object({
  package_id: z.string(),
  email: z.string().email(),
  full_name: z.string().min(1),
  phone: z.string().min(1),
  order_reference: z.string().min(1),
});

export const createSumitPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreatePaymentSchema.parse(input))
  .handler(async ({ data }) => {
    return createSumitPaymentPage(data);
  });

const ConfirmSchema = z.object({
  transactionId: z.string().min(1).optional(),
  orderReference: z.string().min(1).optional(),
  email: z.string().email(),
}).refine((input) => Boolean(input.transactionId || input.orderReference), {
  message: "transactionId or orderReference is required",
});

// Called from the success page to guarantee status update even if the
// webhook was missed (network hiccup, tab closed before it lands, etc.).
export const confirmSumitPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConfirmSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const storedOrder = await resolveSumitOrder({ orderReference: data.orderReference });
      const transactionId = data.transactionId;
      if (!transactionId) {
        return { paid: false, error: "Missing Sumit transaction id" };
      }

      const validation = await verifySumitTransaction(transactionId);
      await markSumitOrder({
        orderReference: data.orderReference || storedOrder?.order_reference,
        transactionId,
        status: validation.paid ? "paid" : "failed",
        raw: validation.raw,
      });
      await updateResendPaymentStatusByEmail(data.email, validation.paid ? "שולם" : "נכשל");
      return { paid: validation.paid };
    } catch (err) {
      console.error("[confirmSumitPayment] error", err);
      return { paid: false, error: (err as Error).message };
    }
  });
