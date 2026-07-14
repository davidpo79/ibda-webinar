import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { syncResendContact, sendRawEmail } from "./resend.server";
import { getNextOpenSession, resolvePackageSessions } from "./schedule.server";
import { recordRegistration } from "./registrations.server";
import { scheduleReminder } from "./reminders.server";
import { formatSessionDate } from "./format-date";
import { buildWelcomeEmail } from "./email-templates.server";

const SubscribeSchema = z.object({
  first_name: z.string().trim().min(1, "יש להזין שם פרטי"),
  last_name: z.string().trim().min(1, "יש להזין שם משפחה"),
  email: z.string().trim().email("כתובת אימייל לא תקינה"),
  phone: z.string().trim().min(1, "יש להזין טלפון נייד"),
  firm_name: z.string().trim().optional(),
  bar_license: z.string().trim().optional(),
  selected_packages: z.array(z.string()),
  core_single_lesson: z.string().trim().optional(),
  core_single_lesson_indexes: z.array(z.number().int().min(1).max(9)).optional(),
  session_id: z.string().trim().optional(),
});

export const subscribeRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubscribeSchema.parse(input))
  .handler(async ({ data }) => {
    let openWebinarDateLabel: string | null = null;
    let resolvedSessionId = data.session_id ?? null;
    if (data.selected_packages.includes("open")) {
      const session = await getNextOpenSession();
      openWebinarDateLabel = formatSessionDate(session?.starts_at);
      resolvedSessionId = resolvedSessionId ?? session?.id ?? null;
    }
    await syncResendContact(data, openWebinarDateLabel);
    const registrationId = await recordRegistration({
      session_id: resolvedSessionId,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      firm_name: data.firm_name,
      bar_license: data.bar_license,
      selected_packages: data.selected_packages,
      core_single_lesson_indexes: data.core_single_lesson_indexes,
    });

    // The free open webinar has no payment gate, so its rich welcome email
    // (real Zoom link) and reminder scheduling fire immediately here. Paid
    // packages get theirs once Sumit confirms payment — see
    // updateResendPaymentStatusByEmail in resend.server.ts.
    if (data.selected_packages.includes("open")) {
      try {
        const sessions = await resolvePackageSessions("open");
        const welcome = buildWelcomeEmail("open", sessions, data.email);
        if (welcome) await sendRawEmail(data.email, welcome.subject, welcome.html);
        await scheduleReminder(registrationId, "open");
      } catch (err) {
        console.error("[subscribeRegistration] open-webinar welcome/reminder failed", err);
      }
    }

    return { ok: true };
  });
