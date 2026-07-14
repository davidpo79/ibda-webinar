import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { syncResendContact, sendRawEmail } from "./resend.server";
import { getNextOpenSession, resolvePackageSessions } from "./schedule.server";
import { recordRegistration } from "./registrations.server";
import { scheduleReminder } from "./reminders.server";
import { buildWelcomeEmail } from "./email-templates.server";
import { phoneSchema } from "./validators";
import { checkRateLimit } from "./rate-limit.server";

const SubscribeSchema = z.object({
  first_name: z.string().trim().min(1, "יש להזין שם פרטי").max(100, "שם ארוך מדי"),
  last_name: z.string().trim().min(1, "יש להזין שם משפחה").max(100, "שם ארוך מדי"),
  email: z.string().trim().email("כתובת אימייל לא תקינה").max(254),
  phone: phoneSchema,
  firm_name: z.string().trim().max(200, "שם ארוך מדי").optional(),
  bar_license: z.string().trim().max(50, "ארוך מדי").optional(),
  selected_packages: z.array(z.string()),
  core_single_lesson: z.string().trim().max(200).optional(),
  core_single_lesson_indexes: z.array(z.number().int().min(1).max(9)).optional(),
  session_id: z.string().trim().optional(),
});

export const subscribeRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubscribeSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
    // Per-IP guards against a scripted registration flood; per-email guards
    // against email-bombing a specific victim address from rotating IPs.
    if (!checkRateLimit(`subscribe:ip:${ip}`, { max: 15, windowMs: 60 * 60 * 1000 })) {
      throw new Error("יותר מדי ניסיונות הרשמה. נסו שוב בעוד שעה.");
    }
    if (
      !checkRateLimit(`subscribe:email:${data.email.toLowerCase()}`, {
        max: 3,
        windowMs: 60 * 60 * 1000,
      })
    ) {
      throw new Error("כתובת המייל הזו כבר נרשמה מספר פעמים. נסו שוב מאוחר יותר.");
    }

    let resolvedSessionId = data.session_id ?? null;
    if (data.selected_packages.includes("open")) {
      const session = await getNextOpenSession();
      resolvedSessionId = resolvedSessionId ?? session?.id ?? null;
    }
    await syncResendContact(data);
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
