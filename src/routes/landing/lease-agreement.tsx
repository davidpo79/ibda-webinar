import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { buildSessionOgDescription } from "@/lib/social-meta";
import { PackageLandingPage } from "@/components/PackageLandingPage";

// This is core lesson 1 ("הסכם השכירות") after the 26.7.26 reschedule —
// coreSessions[0] per getSessionsByType's sort_order ordering.
const LESSON_INDEX = 1;
const TITLE = "הסכם השכירות";
const DESC =
  "בדיקת הצדדים להסכם וניסוח הסכם השכירות - מבדיקת השוכרים והבטוחות ועד לניסוח מותאם של סעיפי ההסכם.";
const PAGE_TITLE = "הסכם השכירות · מפגש מסדרת הליבה · IBDA";

export const Route = createFileRoute("/landing/lease-agreement")({
  head: ({ loaderData }) => {
    const session = loaderData?.coreSessions?.[LESSON_INDEX - 1];
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
  component: LeaseAgreementLanding,
});

function LeaseAgreementLanding() {
  const { coreSessions, pricing } = Route.useLoaderData();
  const session = coreSessions[LESSON_INDEX - 1];
  const dateLabel = session?.date_tbd
    ? "בקרוב!"
    : (session && formatSessionDate(session.starts_at)) || "";
  const p = pricing.core_single;

  return (
    <PackageLandingPage
      dateLabel={dateLabel}
      config={{
        eyebrow: "סדרת הליבה · מפגש 1",
        title: TITLE,
        desc: DESC,
        topics: [
          "מבנה הסכם השכירות",
          "סעיפי מפתח",
          "סעיפי ליבה בהשכרת דירה חדשה מקבלן ומשמעויות",
          "מנעד הבטוחות בהסכם השכירות",
          "עריכת נספח לחידוש הסכם השכירות",
          "עריכת נספח המחאת זכויות בין מוכר כמשכיר, שוכר, רוכש",
        ],
        packageId: "core_single",
        coreSingleLessonIndex: LESSON_INDEX,
        earlyPrice: p?.earlyPrice ?? 180,
        regularPrice: p?.regularPrice ?? 360,
        risen: p?.risen ?? false,
        durationLabel: "90 דקות",
      }}
    />
  );
}
