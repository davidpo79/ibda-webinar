import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSumitPaymentPage, getPackagePrice, verifySumitTransaction } from "./sumit.server";
import { updateResendPaymentStatusByEmail } from "./resend.server";
import { recordOrder } from "./orders.server";

const CreatePaymentSchema = z.object({
  package_ids: z.array(z.string()).min(1),
  email: z.string().email(),
  full_name: z.string().min(1),
  phone: z.string().min(1),
  order_reference: z.string().min(1),
  id_number: z.string().trim().min(5, "מספר ת.ז / ח.פ לא תקין"),
});

export const createSumitPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreatePaymentSchema.parse(input))
  .handler(async ({ data }) => {
    let result: Awaited<ReturnType<typeof createSumitPaymentPage>>;
    try {
      result = await createSumitPaymentPage(data);
    } catch (err) {
      console.error("[createSumitPayment] failed", data.package_ids, data.order_reference, err);
      throw err;
    }
    const amount = data.package_ids.reduce((sum, id) => sum + (getPackagePrice(id) ?? 0), 0);
    await recordOrder({
      orderReference: data.order_reference,
      email: data.email,
      // Comma-joined for a multi-package purchase — one Sumit transaction
      // covers every selected item, so it's one order row, not several.
      packageId: data.package_ids.join(","),
      amount,
    });
    return result;
  });

const ConfirmSchema = z.object({
  transactionId: z.string().min(1),
  email: z.string().email(),
  // Comma-joined package ids for a multi-package purchase (see CreatePaymentSchema).
  package_id: z.string().optional(),
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
      return { paid: validation.paid };
    } catch (err) {
      console.error("[confirmSumitPayment] error", err);
      return { paid: false, error: (err as Error).message };
    }
  });
