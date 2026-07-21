import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_NAME,
  createSessionCookieValue,
  isValidSessionCookie,
  verifyAdminPassword,
  isLoginLocked,
  recordLoginFailure,
  recordLoginSuccess,
} from "./admin-auth.server";
import {
  listRegistrations,
  updateRegistrationContact,
  deleteRegistration,
} from "./registrations.server";
import type { RegistrationRow } from "./registrations.server";
import {
  listOrders,
  markOrderStatus,
  getOrderPackages,
  isTransactionReusedElsewhere,
  deleteOrder,
} from "./orders.server";
import type { OrderRow } from "./orders.server";
import { verifySumitTransactionWithRetry } from "./sumit.server";
import { updateResendPaymentStatusByEmail } from "./resend.server";
import { markCouponUsed } from "./coupons.server";
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
  sendCouponEmailToAddress,
  COUPON_INTRO_DEFAULT,
  COUPON_INSTRUCTION_DEFAULT,
} from "./coupons.server";
import { getEmailSendPolicy, updateEmailSendPolicy } from "./email-policy.server";
import { getEmailOverrides, setEmailOverrides, EDITABLE_PACKAGES } from "./email-content.server";
import {
  WELCOME_SUBJECT_BY_PACKAGE,
  WELCOME_INTRO,
  WELCOME_TITLE_DEFAULT,
  WELCOME_PRESENTER_DEFAULT,
  WELCOME_CLOSING_DEFAULT,
  REMINDER_VERB,
  REMINDER_NOTICE_DEFAULT,
  REMINDER_CLOSING_DEFAULT,
} from "./email-templates.server";
import {
  PRICE_NOTICE_INTRO_DEFAULT,
  PRICE_NOTICE_REMINDER_DEFAULT,
} from "./pricing-notices.server";
import { PAYMENT_STATUS_PAID_DEFAULT, PAYMENT_STATUS_FAILED_DEFAULT } from "./resend.server";
import { buildAllEmailPreviews } from "./email-preview.server";
import { listRecentWebhookLogs } from "./sumit-webhook-log.server";
import { runSumitWebhookReconcileSweep } from "./sumit-reconcile.server";
import {
  BROADCAST_PACKAGE_LABELS,
  resolveBroadcastAudience,
  sendBroadcastTest,
  sendBroadcastEmail,
} from "./broadcast.server";
import type { BroadcastAudienceSource } from "./broadcast.server";

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
    const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
    if (isLoginLocked(ip)) {
      return { ok: false as const, lockedOut: true as const };
    }
    if (!verifyAdminPassword(data.password)) {
      recordLoginFailure(ip);
      return { ok: false as const };
    }
    recordLoginSuccess(ip);
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

const DeleteRegistrationSchema = z.object({ id: z.string().min(1) });

// Removes a lead and its scheduled reminder emails — used to clean up
// test/duplicate submissions from the dashboard. Doesn't touch orders
// (a separate table, correlated only by email) — use deleteOrderAction
// for those.
export const deleteRegistrationAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteRegistrationSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await deleteRegistration(data.id);
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

const SendCouponToEmailSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(100).optional(),
  discountPercent: z.number().int().min(1).max(100),
});

// Same personal single-use coupon flow as sendCouponToLeadAction, but for a
// recipient who has no lead row yet — e.g. someone who asked for a discount
// by phone/email before ever submitting the site's registration form.
export const sendCouponToEmailAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SendCouponToEmailSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    const result = await sendCouponEmailToAddress(
      data.email,
      data.name || null,
      data.discountPercent,
    );
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
  saturdayEndsHour: z.number().int().min(0).max(23).nullable(),
});

export const updateEmailSendPolicyAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateEmailPolicySchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await updateEmailSendPolicy(data);
    return { ok: true };
  });

// Backs the admin "email editor" page: current overrides + a live preview of
// every automated email (rendered via the real send-path builder functions,
// see email-preview.server.ts) + each field's hardcoded fallback value, so
// the UI can show what will actually go out if a field is left blank.
export const getAdminEmailContentData = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminSession();
  const [overrides, previews] = await Promise.all([getEmailOverrides(), buildAllEmailPreviews()]);
  return {
    overrides,
    previews,
    packages: EDITABLE_PACKAGES,
    defaults: {
      welcomeTitle: WELCOME_TITLE_DEFAULT,
      welcomePresenter: WELCOME_PRESENTER_DEFAULT,
      welcomeSubject: WELCOME_SUBJECT_BY_PACKAGE,
      welcomeIntro: WELCOME_INTRO,
      welcomeClosing: WELCOME_CLOSING_DEFAULT,
      reminderVerb: REMINDER_VERB,
      reminderNotice: REMINDER_NOTICE_DEFAULT,
      reminderClosing: REMINDER_CLOSING_DEFAULT,
      couponIntro: COUPON_INTRO_DEFAULT,
      couponInstruction: COUPON_INSTRUCTION_DEFAULT,
      priceNoticeIntro: PRICE_NOTICE_INTRO_DEFAULT,
      priceNoticeReminder: PRICE_NOTICE_REMINDER_DEFAULT,
      paymentStatusPaidTitle: PAYMENT_STATUS_PAID_DEFAULT.title,
      paymentStatusPaidBody: PAYMENT_STATUS_PAID_DEFAULT.body,
      paymentStatusFailedTitle: PAYMENT_STATUS_FAILED_DEFAULT.title,
      paymentStatusFailedBody: PAYMENT_STATUS_FAILED_DEFAULT.body,
    },
  };
});

const UpdateEmailContentSchema = z.object({ changes: z.record(z.string(), z.string()) });

// An empty string for a given key deletes its override row (see
// setEmailOverrides), reverting that field to its hardcoded default.
export const updateEmailContentAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateEmailContentSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await setEmailOverrides(data.changes);
    return { ok: true };
  });

const VerifyOrderPaymentSchema = z.object({
  orderReference: z.string().min(1),
  transactionId: z.string().min(1),
});

// Answers the admin dashboard's "אימות הזמנה" button on a pending/failed
// order that already has a transaction id — an independent, real check
// against Sumit (never a blind "mark as paid"), for the case where a charge
// actually went through but our own webhook/return-redirect never resolved
// it (the settlement-lag race this exists to catch — see
// verifySumitTransactionWithRetry). Only a genuinely confirmed payment
// marks the order paid and sends the customer their real welcome email;
// anything else is reported back without changing anything.
export const verifyOrderPaymentAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VerifyOrderPaymentSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    const order = await getOrderPackages(data.orderReference);
    if (!order) return { outcome: "not_found" as const };

    let validation;
    try {
      validation = await verifySumitTransactionWithRetry(data.transactionId);
    } catch (err) {
      console.error("[verifyOrderPaymentAction] verify error", err);
      return { outcome: "unresolved" as const };
    }

    if (validation.paid) {
      const reused = await isTransactionReusedElsewhere(data.transactionId, data.orderReference);
      if (reused) {
        return { outcome: "failed" as const, reason: "transaction_reused" as const };
      }
      await updateResendPaymentStatusByEmail(order.email, "שולם", order.packageIds);
      await markOrderStatus({
        orderReference: data.orderReference,
        transactionId: data.transactionId,
        status: "paid",
      });
      if (order.couponCode) await markCouponUsed(order.couponCode);
      return { outcome: "paid" as const };
    }
    if (validation.definitivelyFailed) {
      await markOrderStatus({
        orderReference: data.orderReference,
        transactionId: data.transactionId,
        status: "failed",
      });
      return { outcome: "failed" as const };
    }
    return { outcome: "unresolved" as const };
  });

const DeleteOrderSchema = z.object({
  orderReference: z.string().min(1),
});

// Removes every line item of an order (a multi-package/multi-lesson
// purchase can be several rows sharing an order_reference) — used to clean
// up test/duplicate orders from the dashboard.
export const deleteOrderAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteOrderSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    await deleteOrder(data.orderReference);
    return { ok: true };
  });

const ForceMarkOrderPaidSchema = z.object({
  orderReference: z.string().min(1),
});

// The admin dashboard's "אישור ידני" action — a deliberate bypass of
// verifyOrderPaymentAction's real Sumit check, for when the admin has
// already confirmed the charge went through some other way (Sumit's own
// dashboard, a bank statement) and verifyOrderPaymentAction can't resolve
// it (e.g. Sumit's verify endpoint erroring on an old/edge-case
// transaction). Unconditionally marks the order paid and sends the
// customer's real welcome email — the client always confirms with the
// admin before calling this, since there's no independent check here.
export const forceMarkOrderPaidAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ForceMarkOrderPaidSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    const order = await getOrderPackages(data.orderReference);
    if (!order) return { outcome: "not_found" as const };
    await updateResendPaymentStatusByEmail(order.email, "שולם", order.packageIds);
    await markOrderStatus({ orderReference: data.orderReference, status: "paid" });
    if (order.couponCode) await markCouponUsed(order.couponCode);
    return { outcome: "paid" as const };
  });

// Every Sumit webhook call that passed the signature check, most recent
// first — the audit trail behind "did Sumit send it? did our handler
// resolve it?" for diagnosing a stuck order without having to grep
// ephemeral Railway logs across since-removed deployments.
export const getAdminWebhookLogData = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminSession();
  return { logs: await listRecentWebhookLogs(150) };
});

// Manually triggers the same reconcile pass the 10-minute background sweep
// runs automatically — lets the admin force an immediate retry (e.g. right
// after fixing something) instead of waiting for the next tick.
export const runSumitReconcileNowAction = createServerFn({ method: "POST" }).handler(async () => {
  assertAdminSession();
  return await runSumitWebhookReconcileSweep();
});

export const getAdminBroadcastPackageOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdminSession();
    return {
      packages: Object.entries(BROADCAST_PACKAGE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    };
  },
);

const BroadcastAudienceSchema = z.object({
  source: z.enum(["leads", "buyers", "all"]),
  packageIds: z.array(z.string()),
});

export const previewBroadcastAudienceAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BroadcastAudienceSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    const audience = await resolveBroadcastAudience(
      data.source as BroadcastAudienceSource,
      data.packageIds,
    );
    return { count: audience.length, sample: audience.slice(0, 5).map((r) => r.email) };
  });

// Combined base64 attachment payload cap — Resend allows up to 40MB per
// email — base64 encoding inflates raw file size by ~33%, so a 35MB raw
// attachment cap (see MAX_ATTACHMENTS_BYTES in admin/broadcast.tsx) needs
// ~47MB of base64 headroom here; 50MB leaves a small margin while still
// keeping some distance from Resend's actual 40MB-per-email ceiling.
const MAX_ATTACHMENTS_BASE64_LENGTH = 50 * 1024 * 1024;

const BroadcastAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(1),
});

const BroadcastComposeSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  bodyHtml: z.string().min(1),
  ctaText: z.string().trim().max(100).optional().default(""),
  ctaUrl: z.string().trim().max(2000).optional().default(""),
  attachments: z.array(BroadcastAttachmentSchema).max(10).optional().default([]),
});

function assertAttachmentsSize(attachments: { contentBase64: string }[]) {
  const total = attachments.reduce((sum, a) => sum + a.contentBase64.length, 0);
  if (total > MAX_ATTACHMENTS_BASE64_LENGTH) {
    throw new Error("הקבצים המצורפים גדולים מדי (מעל המגבלה המשולבת)");
  }
}

const SendBroadcastTestSchema = BroadcastComposeSchema.extend({
  testEmail: z.string().trim().email(),
});

export const sendBroadcastTestAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SendBroadcastTestSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    assertAttachmentsSize(data.attachments);
    await sendBroadcastTest(data);
    return { ok: true };
  });

const SendBroadcastEmailSchema = BroadcastComposeSchema.extend({
  source: z.enum(["leads", "buyers", "all"]),
  packageIds: z.array(z.string()),
});

export const sendBroadcastEmailAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SendBroadcastEmailSchema.parse(input))
  .handler(async ({ data }) => {
    assertAdminSession();
    assertAttachmentsSize(data.attachments);
    return await sendBroadcastEmail({
      ...data,
      source: data.source as BroadcastAudienceSource,
    });
  });
