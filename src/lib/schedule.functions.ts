import { createServerFn } from "@tanstack/react-start";
import { getAllSessions, getNextOpenSession } from "./schedule.server";

// Public read of the current schedule — used by loaders on the marketing
// pages (index, /webinar, /thank-you) so dates come from the database
// instead of being hardcoded.
export const getScheduleData = createServerFn({ method: "GET" }).handler(async () => {
  const [openSession, allSessions] = await Promise.all([getNextOpenSession(), getAllSessions()]);
  return {
    openSession,
    coreSessions: allSessions.filter((s) => s.type === "core"),
    premiumSessions: allSessions.filter((s) => s.type === "premium"),
  };
});
