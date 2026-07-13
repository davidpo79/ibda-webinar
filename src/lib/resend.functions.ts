import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { syncResendContact } from "./resend.server";
import { appendRegistrationToSheet } from "./google-sheets.server";

const SubscribeSchema = z.object({
  first_name: z.string().trim().min(1, "יש להזין שם פרטי"),
  last_name: z.string().trim().min(1, "יש להזין שם משפחה"),
  email: z.string().trim().email("כתובת אימייל לא תקינה"),
  phone: z.string().trim().min(1, "יש להזין טלפון נייד"),
  firm_name: z.string().trim().optional(),
  bar_license: z.string().trim().optional(),
  selected_packages: z.array(z.string()),
  core_single_lesson: z.string().trim().optional(),
  core_single_lesson_index: z.number().int().min(1).max(9).optional(),
});

export const subscribeRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubscribeSchema.parse(input))
  .handler(async ({ data }) => {
    // Resend sync (audience + confirmation email) is the primary flow — its
    // failure fails the request. Sheets append is a backup and must not
    // block registration.
    await syncResendContact(data);
    try {
      await appendRegistrationToSheet(data);
    } catch (err) {
      console.error("[subscribe] sheets backup failed (non-fatal)", err);
    }
    return { ok: true };
  });
