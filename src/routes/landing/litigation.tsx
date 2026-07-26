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
        content: "סדנת פרימיום: כשעסקאות משתבשות — ניהול סכסוכים, ביטול ואכיפת הסכמים.",
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
          "ההליך המשפטי: עילות ביטול (טעות, הטעיה, אי התאמה), הפרות ופיצויים מוסכמים",
          "סעדים ואכיפה: סעדים זמניים, עסקאות נוגדות ואכיפת הסכם מכר",
          "הליכים מיוחדים: תביעות נגד קבלנים, חריגות בבית משותף ופירוק שיתוף בירושה",
          "תרגול מעשי: כתיבת כתב תביעה, בקשה לסעד זמני וניתוח תיקים באמצעות בינה מלאכותית",
        ],
        packageId: PACKAGE_ID,
        earlyPrice: p?.earlyPrice ?? 360,
        regularPrice: p?.regularPrice ?? 480,
        risen: p?.risen ?? false,
      }}
    />
  );
}
