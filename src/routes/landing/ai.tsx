import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { PackageLandingPage } from "@/components/PackageLandingPage";

export const Route = createFileRoute("/landing/ai")({
  head: () => ({
    meta: [
      { title: "העתיד כבר כאן! AI ואוטומציות בעבודת עורך הדין · IBDA" },
      {
        name: "description",
        content: "סדנת פרימיום: וובינר ייחודי שמכניס את עורך הדין לעולם הטכנולוגיה המשפטית.",
      },
    ],
  }),
  loader: async () => getScheduleData(),
  component: AiWorkshopLanding,
});

const PACKAGE_ID = "premium_ai";

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
        title: "העתיד כבר כאן! AI ואוטומציות בעבודת עורך הדין",
        desc: "וובינר ייחודי שמכניס את עורך הדין לעולם הטכנולוגיה המשפטית.",
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
      }}
    />
  );
}
