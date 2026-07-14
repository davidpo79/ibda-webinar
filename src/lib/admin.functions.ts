import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_NAME,
  createSessionCookieValue,
  isValidSessionCookie,
  verifyAdminPassword,
} from "./admin-auth.server";
import { listRegistrations, updateRegistrationContact } from "./registrations.server";
import type { RegistrationRow } from "./registrations.server";
import { listOrders } from "./orders.server";
import type { OrderRow } from "./orders.server";
import {
  getAllSessions,
  updateSessionDate,
  createOpenSession,
  createSessionCohort,
} from "./schedule.server";
import { getAllPackagePricing, updatePackagePricing } from "./pricing.server";
import {
  listCoupons,
  createGenericCoupon,
  setCouponActive,
  sendCouponEmailToRegistration,
} from "./coupons.server";
import { getEmailSendPolicy, updateEmailSendPolicy } from "./email-policy.server";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function assertAdminSession() {
  if (!isValidSessionCookie(getCookie(ADMIN_COOKIE_NAME))) {
    throw new Error("unauthorized");
  }
}

const LoginSchema = z.object({ password: z.string().min(1) });

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LoginSchema.parse(input))
  .handler(async ({ data }) => {
    if (!verifyAdminPassword(data.password)) {
      return { ok: false as const };
    }
    setCookie(ADMIN_COOKIE_NAME, createSessionCookieValue(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(ADMIN_COOKIE_NAME, { path: "/" });
  return { ok: true };
});

export type OrderWithContact = OrderRow & { buyer_name: string | null; buyer_phone: string | null };

// Orders only carry an email — the buyer's name/phone live on their
// registration. Joined here in memory (both lists are already loaded for
// this page) rather than in SQL, keyed on the most recent registration per
// email since a lead can register more than once.
function attachContacts(orders: OrderRow[], registrations: RegistrationRow[]): OrderWithContact[] {
  const contactByEmail = new Map<string, { name: string; phone: string }>();
  for (const r of registrations) {
    const key = r.email.toLowerCase();
    if (!contactByEmail.has(key)) {
      contactByEmail.set(key, { name: `${r.first_name} ${r.last_name}`.trim(), phone: r.phone });
    }
  }
  return orders.map((o) => {
    const contact = contactByEmail.get(o.email.toLowerCase());
    return { ...o, buyer_name: contact?.name ?? null, buyer_phone: contact?.phone ?? null };
  });
}

export const getAdminDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminSession();
  const [registrations, orders] = await Promise.all([listRegistrations(), listOrders()]);
  return { registrations, orders: attachContacts(orders, registrations) };
});

const UpdateRegistrationSchema = z.object({
  id: z.string().min(1),
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  firm_name: z.string().trim().optional(),
  bar_license: z.string().trim().optional(),
});

// Lets the admin correct a lead's contact details (e.g. a phone number that
// ended up pasted into the email field at submission time).
export const updateRegistrationAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateRegistrationSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await updateRegistrationContact(data.id, data);
    return { ok: true };
  });

export const getAdminScheduleData = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminSession();
  return { sessions: await getAllSessions() };
});

const UpdateSessionDateSchema = z.object({
  id: z.string().min(1),
  startsAt: z.string().min(1),
});

export const updateSessionDateAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateSessionDateSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await updateSessionDate(data.id, data.startsAt);
    return { ok: true };
  });

const CreateOpenSessionSchema = z.object({
  title: z.string().trim().min(1),
  startsAt: z.string().min(1),
});

export const createOpenSessionAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateOpenSessionSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    const session = await createOpenSession(data.title, data.startsAt);
    return { session };
  });

const CreateSessionCohortSchema = z.object({
  key: z.string().trim().min(1),
  startsAt: z.string().min(1),
});

// Schedules a new future date for an existing core lesson or premium
// workshop without touching its earlier cohort(s).
export const createSessionCohortAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateSessionCohortSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    const session = await createSessionCohort(data.key, data.startsAt);
    return { session };
  });

export const getAdminPricingData = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminSession();
  return { pricing: await getAllPackagePricing() };
});

const UpdatePricingSchema = z.object({
  packageId: z.string().min(1),
  earlyPrice: z.number().positive(),
  regularPrice: z.number().positive(),
  cutoffAt: z.string().min(1).nullable(),
});

export const updatePackagePricingAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdatePricingSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await updatePackagePricing(data.packageId, {
      earlyPrice: data.earlyPrice,
      regularPrice: data.regularPrice,
      cutoffAt: data.cutoffAt,
    });
    return { ok: true };
  });

export const getAdminCouponsData = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminSession();
  return { coupons: await listCoupons() };
});

const CreateCouponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  discountPercent: z.number().int().min(1).max(100),
});

export const createGenericCouponAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateCouponSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    const coupon = await createGenericCoupon(data.code, data.discountPercent);
    return { coupon };
  });

const SetCouponActiveSchema = z.object({ id: z.string().min(1), active: z.boolean() });

export const setCouponActiveAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SetCouponActiveSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await setCouponActive(data.id, data.active);
    return { ok: true };
  });

const SendCouponToLeadSchema = z.object({
  registrationId: z.string().min(1),
  discountPercent: z.number().int().min(1).max(100),
});

// Generates a single-use coupon for one lead and emails it to them directly
// — the "send a discount code to a specific lead" flow from the admin leads
// table (distinct from the reusable generic codes created above).
export const sendCouponToLeadAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SendCouponToLeadSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    const result = await sendCouponEmailToRegistration(data.registrationId, data.discountPercent);
    return result;
  });

export const getAdminEmailPolicyData = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminSession();
  return { policy: await getEmailSendPolicy() };
});

const UpdateEmailPolicySchema = z.object({
  blockedWeekdays: z.array(z.number().int().min(0).max(6)),
  allowedHourStart: z.number().int().min(0).max(23),
  allowedHourEnd: z.number().int().min(1).max(24),
  blockedDates: z.array(z.string().min(1)),
});

export const updateEmailSendPolicyAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateEmailPolicySchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await updateEmailSendPolicy(data);
    return { ok: true };
  });
