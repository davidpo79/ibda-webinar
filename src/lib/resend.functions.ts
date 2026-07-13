import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { syncResendContact } from "./resend.server";
import { getNextOpenSession } from "./schedule.server";
import { recordRegistration } from "./registrations.server";
import { formatSessionDate } from "./format-date";

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
  session_id: z.string().trim().optional(),
});

export const subscribeRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubscribeSchema.parse(input))
  .handler(async ({ data }) => {
    let openWebinarDateLabel: string | null = null;
    if (data.selected_packages.includes("open")) {
      const session = await getNextOpenSession();
      openWebinarDateLabel = formatSessionDate(session?.starts_at);
    }
    await syncResendContact(data, openWebinarDateLabel);
    await recordRegistration({
      session_id: data.session_id ?? null,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      firm_name: data.firm_name,
      bar_license: data.bar_license,
      selected_packages: data.selected_packages,
    });
    return { ok: true };
  });
