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
        content: "סדנת פרימיום: הסדרת זכויות במקרקעין מורכבים ובלתי רשומים.",
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
        desc: "הסדרת זכויות במקרקעין מורכבים ובלתי רשומים.",
        topics: [
          "הסכמי שיתוף: מבנה נכון, הליכי רישום וההשלכות של אי רישום",
          "זכויות מורכבות: פרצלציה, קרקעות מנהל לא מוסדרות וזכויות חכירה",
          "התיישנות: ביסוס זכויות מכוח שימוש והסדרתן",
          "תרגול מעשי: ניסוח הסכם שיתוף מלא וכתיבת חוות דעת משפטית ללקוח",
        ],
        packageId: PACKAGE_ID,
        earlyPrice: p?.earlyPrice ?? 540,
        regularPrice: p?.regularPrice ?? 720,
        risen: p?.risen ?? false,
      }}
    />
  );
}
