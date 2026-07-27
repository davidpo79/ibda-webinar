import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { PackageLandingPage } from "@/components/PackageLandingPage";

export const Route = createFileRoute("/landing/litigation")({
  head: () => ({
    meta: [
      { title: 'ליטיגציה בנדל"ן - סוגיות נבחרות · סדנת פרימיום · IBDA' },
      {
        name: "description",
        content: "סדנת פרימיום: כשעסקאות משתבשות - ניהול סכסוכים, ביטול ואכיפת הסכמים.",
      },
    ],
  }),
  loader: async () => getScheduleData(),
  component: LitigationWorkshopLanding,
});

const PACKAGE_ID = "premium_litigation";

function LitigationWorkshopLanding() {
  const { premiumSessions, pricing } = Route.useLoaderData();
  const session = premiumSessions.find((s) => s.key === PACKAGE_ID);
  const dateLabel = session?.date_tbd
    ? "בקרוב!"
    : (session && formatSessionDate(session.starts_at)) || "";
  const p = pricing[PACKAGE_ID];

  return (
    <PackageLandingPage
      dateLabel={dateLabel}
      config={{
        eyebrow: "סדנת פרימיום",
        title: 'ליטיגציה בנדל"ן - סוגיות נבחרות',
        desc: "כשעסקאות משתבשות: ניהול סכסוכים, ביטול ואכיפת הסכמים.",
        topics: [
          "אכיפה, ביטול, הפרה יסודית - ומה שביניהם",
          "סעדים זמניים",
          "דגשים מהפסיקה",
          "תרגול מעשי - ניסוח דוגמת כתב תביעה ובקשה לסעד זמני",
        ],
        packageId: PACKAGE_ID,
        earlyPrice: p?.earlyPrice ?? 360,
        regularPrice: p?.regularPrice ?? 480,
        risen: p?.risen ?? false,
        durationLabel: "שעתיים",
      }}
    />
  );
}
