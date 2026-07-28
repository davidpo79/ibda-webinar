import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { buildSessionOgDescription } from "@/lib/social-meta";
import { PackageLandingPage } from "@/components/PackageLandingPage";

const PACKAGE_ID = "premium_ai";
const TITLE = "העתיד כבר כאן! AI ואוטומציות בעבודת עורך הדין";
const DESC = "וובינר ייחודי שמכניס את עורך הדין לעולם הטכנולוגיה המשפטית.";
const PAGE_TITLE = "העתיד כבר כאן! AI ואוטומציות בעבודת עורך הדין · IBDA";

export const Route = createFileRoute("/landing/ai")({
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
  component: AiWorkshopLanding,
});

function AiWorkshopLanding() {
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
        desc: DESC,
        topics: [
          "מבוא לבינה מלאכותית למשפטנים",
          "כלי AI לכתיבה משפטית",
          "בדיקת מסמכים באמצעות AI",
          "אתיקה ו-AI",
          "מתרגלים live",
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
