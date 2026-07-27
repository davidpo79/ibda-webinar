import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { PackageLandingPage } from "@/components/PackageLandingPage";

export const Route = createFileRoute("/landing/partnership")({
  head: () => ({
    meta: [
      { title: "שיתוף במקרקעין · סדנת פרימיום · IBDA" },
      {
        name: "description",
        content: "סדנת פרימיום: הסדרת זכויות משותפות במקרקעין.",
      },
    ],
  }),
  loader: async () => getScheduleData(),
  component: PartnershipWorkshopLanding,
});

const PACKAGE_ID = "premium_partnership";

function PartnershipWorkshopLanding() {
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
        title: "שיתוף במקרקעין",
        desc: "הסדרת זכויות משותפות במקרקעין.",
        topics: [
          "בין בית משותף להסכם שיתוף",
          "ניסוח הסכם השיתוף",
          "דיווח למיסוי - איך ומתי",
          "פירוק השיתוף - דגשים",
        ],
        packageId: PACKAGE_ID,
        earlyPrice: p?.earlyPrice ?? 540,
        regularPrice: p?.regularPrice ?? 720,
        risen: p?.risen ?? false,
        durationLabel: "שעתיים",
      }}
    />
  );
}
