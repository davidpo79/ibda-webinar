import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  PARTNER_COOKIE_NAME,
  createPartnerCookieValue,
  readPartnerSession,
  verifyPartnerCredentials,
  createResetToken,
  consumeResetToken,
  isResetTokenValid,
} from "./partner-auth.server";
import type { PartnerUser } from "./partner-auth.server";
// The admin panel's in-process brute-force guard is generic over its key —
// reused here under a "partner:" prefix so the two login forms get separate
// counters without duplicating the logic.
import { isLoginLocked, recordLoginFailure, recordLoginSuccess } from "./admin-auth.server";
import {
  getRetainerConfig,
  updateRetainerConfig,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  listPayments,
  createPayment,
  deletePayment,
  getRetainerSummary,
} from "./retainer.server";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

async function assertPartnerSession(): Promise<PartnerUser> {
  const user = await readPartnerSession(getCookie(PARTNER_COOKIE_NAME));
  if (!user) throw new Error("unauthorized");
  return user;
}

// Every mutating action goes through this. The UI also hides the forms from
// a viewer, but that's cosmetic — this is the check that actually enforces
// it, so a hand-crafted request from Yifat's session is still rejected.
async function assertPartnerEditor(): Promise<PartnerUser> {
  const user = await assertPartnerSession();
  if (user.role !== "editor") throw new Error("forbidden");
  return user;
}

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

export const partnerLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LoginSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
    const key = `partner:${ip}`;
    if (isLoginLocked(key)) {
      return { ok: false as const, lockedOut: true as const };
    }
    const user = await verifyPartnerCredentials(data.username, data.password);
    if (!user) {
      recordLoginFailure(key);
      return { ok: false as const };
    }
    recordLoginSuccess(key);
    setCookie(PARTNER_COOKIE_NAME, createPartnerCookieValue(user.username), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return { ok: true as const };
  });

export const partnerLogout = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(PARTNER_COOKIE_NAME, { path: "/" });
  return { ok: true };
});

export const getPartnerDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const user = await assertPartnerSession();
  const [config, entries, payments, summary] = await Promise.all([
    getRetainerConfig(),
    listEntries(),
    listPayments(),
    getRetainerSummary(),
  ]);
  return { user, config, entries, payments, summary };
});

const EntrySchema = z.object({
  workedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
  hours: z.number().positive().max(24),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().max(2000).nullable().optional(),
});

export const createEntryAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => EntrySchema.parse(input))
  .handler(async ({ data }) => {
    await assertPartnerEditor();
    await createEntry({
      workedOn: data.workedOn,
      hours: data.hours,
      title: data.title,
      details: data.details || null,
    });
    return { ok: true };
  });

const UpdateEntrySchema = EntrySchema.extend({ id: z.string().uuid() });

export const updateEntryAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateEntrySchema.parse(input))
  .handler(async ({ data }) => {
    await assertPartnerEditor();
    await updateEntry(data.id, {
      workedOn: data.workedOn,
      hours: data.hours,
      title: data.title,
      details: data.details || null,
    });
    return { ok: true };
  });

const IdSchema = z.object({ id: z.string().uuid() });

export const deleteEntryAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data }) => {
    await assertPartnerEditor();
    await deleteEntry(data.id);
    return { ok: true };
  });

const PaymentSchema = z.object({
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
  amount: z.number().positive().max(1_000_000),
  method: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const createPaymentAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PaymentSchema.parse(input))
  .handler(async ({ data }) => {
    await assertPartnerEditor();
    await createPayment({
      paidOn: data.paidOn,
      amount: data.amount,
      method: data.method || null,
      note: data.note || null,
    });
    return { ok: true };
  });

export const deletePaymentAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data }) => {
    await assertPartnerEditor();
    await deletePayment(data.id);
    return { ok: true };
  });

const ConfigSchema = z.object({
  totalHours: z.number().positive().max(10_000),
  totalAmount: z.number().nonnegative().max(10_000_000),
});

export const updateConfigAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConfigSchema.parse(input))
  .handler(async ({ data }) => {
    await assertPartnerEditor();
    await updateRetainerConfig(data);
    return { ok: true };
  });

/* -------------------------- password reset -------------------------- */

const ForgotSchema = z.object({ username: z.string().trim().min(1).max(60) });

// Always reports success, whether or not the username exists — otherwise
// this endpoint becomes a way to enumerate valid usernames. Rate-limited on
// the same per-IP counter as login so it can't be used to spam an inbox.
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ForgotSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
    const key = `partner-reset:${ip}`;
    if (isLoginLocked(key)) return { ok: true as const };
    recordLoginFailure(key);

    const issued = await createResetToken(data.username);
    if (issued) {
      const { sendPasswordResetEmail } = await import("./retainer-digest.server");
      try {
        await sendPasswordResetEmail(issued.email, issued.displayName, issued.token);
      } catch (err) {
        console.error("[partner] reset email failed", err);
      }
    }
    return { ok: true as const };
  });

const ResetSchema = z.object({
  token: z.string().trim().min(10).max(200),
  password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים").max(200),
});

export const completePasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ResetSchema.parse(input))
  .handler(async ({ data }) => {
    const ok = await consumeResetToken(data.token, data.password);
    return { ok };
  });

const TokenSchema = z.object({ token: z.string().trim().min(10).max(200) });

export const checkResetToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    return { valid: await isResetTokenValid(data.token) };
  });

/* -------------------------- digest -------------------------- */

// Lets the editor fire the twice-weekly report on demand, for testing the
// content or sending an off-schedule update.
export const sendDigestNowAction = createServerFn({ method: "POST" }).handler(async () => {
  await assertPartnerEditor();
  const { sendRetainerDigestNow } = await import("./retainer-digest.server");
  await sendRetainerDigestNow();
  return { ok: true };
});
