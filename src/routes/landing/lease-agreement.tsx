import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { PackageLandingPage } from "@/components/PackageLandingPage";

export const Route = createFileRoute("/landing/lease-agreement")({
  head: () => ({
    meta: [
      { title: "הסכם השכירות · מפגש מסדרת הליבה · IBDA" },
      {
        name: "description",
        content:
          'הרשמה למפגש "הסכם השכירות" מסדרת הליבה של IBDA — בדיקת הצדדים להסכם וניסוח הסכם השכירות.',
      },
    ],
  }),
  loader: async () => getScheduleData(),
  component: LeaseAgreementLanding,
});

// This is core lesson 1 ("הסכם השכירות") after the 26.7.26 reschedule —
// coreSessions[0] per getSessionsByType's sort_order ordering.
const LESSON_INDEX = 1;

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
        title: "הסכם השכירות",
        desc: "בדיקת הצדדים להסכם וניסוח הסכם השכירות — מבדיקת השוכרים והבטוחות ועד לניסוח מותאם של סעיפי ההסכם.",
        topics: [
          "מבדיקת השוכרים והבטוחות ועד לניסוח מותאם של סעיפי ההסכם.",
          "סעיפי ליבה בהשכרת דירה חדשה מקבלן ומשמעויות.",
        ],
        packageId: "core_single",
        coreSingleLessonIndex: LESSON_INDEX,
        earlyPrice: p?.earlyPrice ?? 180,
        regularPrice: p?.regularPrice ?? 360,
        risen: p?.risen ?? false,
      }}
    />
  );
}
