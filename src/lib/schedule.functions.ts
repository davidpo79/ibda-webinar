import { createServerFn } from "@tanstack/react-start";
import { getNextOpenSession, getSessionsByType } from "./schedule.server";

// Public read of the current schedule — used by loaders on the marketing
// pages (index, /webinar, /thank-you) so dates come from the database
// instead of being hardcoded. getSessionsByType resolves exactly one
// (current/next) row per lesson/workshop key even when the admin has
// scheduled extra future cohorts, so the fixed-length CORE_SERIES/premium
// arrays these pages index into stay aligned.
export const getScheduleData = createServerFn({ method: "GET" }).handler(async () => {
  const [openSession, coreSessions, premiumSessions] = await Promise.all([
    getNextOpenSession(),
    getSessionsByType("core"),
    getSessionsByType("premium"),
  ]);
  return { openSession, coreSessions, premiumSessions };
});
