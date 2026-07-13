import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSumitPaymentPage, verifySumitTransaction } from "./sumit.server";
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
  transactionId: z.string().min(1),
  email: z.string().email(),
});

// Called from the success page to guarantee status update even if the
// webhook was missed (network hiccup, tab closed before it lands, etc.).
export const confirmSumitPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConfirmSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const validation = await verifySumitTransaction(data.transactionId);
      await updateResendPaymentStatusByEmail(data.email, validation.paid ? "שולם" : "נכשל");
      return { paid: validation.paid };
    } catch (err) {
      console.error("[confirmSumitPayment] error", err);
      return { paid: false, error: (err as Error).message };
    }
  });
