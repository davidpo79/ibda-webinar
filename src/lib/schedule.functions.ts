import { createServerFn } from "@tanstack/react-start";
import { getNextOpenSession, getSessionsByType } from "./schedule.server";
import { getAllPackagePricing } from "./pricing.server";

// Public read of the current schedule — used by loaders on the marketing
// pages (index, /webinar, /thank-you) so dates come from the database
// instead of being hardcoded. getSessionsByType resolves exactly one
// (current/next) row per lesson/workshop key even when the admin has
// scheduled extra future cohorts, so the fixed-length CORE_SERIES/premium
// arrays these pages index into stay aligned.
export const getScheduleData = createServerFn({ method: "GET" }).handler(async () => {
  const [openSession, coreSessions, premiumSessions, pricingRows] = await Promise.all([
    getNextOpenSession(),
    getSessionsByType("core"),
    getSessionsByType("premium"),
    getAllPackagePricing(),
  ]);
  const now = Date.now();
  const pricing: Record<
    string,
    { currentPrice: number; earlyPrice: number; regularPrice: number; risen: boolean }
  > = {};
  for (const row of pricingRows) {
    const risen = Boolean(row.cutoff_at) && new Date(row.cutoff_at!).getTime() <= now;
    pricing[row.package_id] = {
      currentPrice: Number(risen ? row.regular_price : row.early_price),
      earlyPrice: Number(row.early_price),
      regularPrice: Number(row.regular_price),
      risen,
    };
  }
  return { openSession, coreSessions, premiumSessions, pricing };
});
