import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { buildSessionOgDescription } from "@/lib/social-meta";
import { PackageLandingPage } from "@/components/PackageLandingPage";

const PACKAGE_ID = "premium_litigation";
const TITLE = 'ליטיגציה בנדל"ן - סוגיות נבחרות';
const DESC = "כשעסקאות משתבשות: ניהול סכסוכים, ביטול ואכיפת הסכמים.";
const PAGE_TITLE = 'ליטיגציה בנדל"ן - סוגיות נבחרות · סדנת פרימיום · IBDA';

export const Route = createFileRoute("/landing/litigation")({
  head: ({ loaderData }) => {
    const session = loaderData?.premiumSessions?.find((s) => s.key === PACKAGE_ID);
    const description = buildSessionOgDescription(session, TITLE, DESC);
    return {
      meta: [
        { title: PAGE_TITLE },
        { name: "description", content: description },
        { property: "og:title", content: PAGE_TITLE },
        { property: "og:description", content: description },
        { name: "twitter:title", content: PAGE_TITLE },
        { name: "twitter:description", content: description },
      ],
    };
  },
  loader: async () => getScheduleData(),
  component: LitigationWorkshopLanding,
});

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
        title: TITLE,
        desc: buildSessionOgDescription(session, TITLE, DESC),
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
