import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_NAME,
  createSessionCookieValue,
  isValidSessionCookie,
  verifyAdminPassword,
} from "./admin-auth.server";
import { listRegistrations } from "./registrations.server";
import { listOrders } from "./orders.server";
import { getAllSessions, updateSessionDate, createOpenSession } from "./schedule.server";

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

export const getAdminDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  assertAdminSession();
  const [registrations, orders] = await Promise.all([listRegistrations(), listOrders()]);
  return { registrations, orders };
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
