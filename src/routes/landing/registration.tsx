import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { PackageLandingPage } from "@/components/PackageLandingPage";

export const Route = createFileRoute("/landing/registration")({
  head: () => ({
    meta: [
      { title: "רישום בית משותף · סדנת פרימיום · IBDA" },
      {
        name: "description",
        content: "סדנת פרימיום: ניהול ההליך השלם לרישום והסדרת זכויות בבתים משותפים.",
      },
    ],
  }),
  loader: async () => getScheduleData(),
  component: RegistrationWorkshopLanding,
});

const PACKAGE_ID = "premium_registration";

function RegistrationWorkshopLanding() {
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
        eyebrow: "סדנת פרימיום · 4 שעות",
        title: "רישום בית משותף",
        desc: "ניהול ההליך השלם לרישום והסדרת זכויות בבתים משותפים.",
        topics: [
          "צו רישום: תנאי סף, הכנה, אישור ותיקון",
          "תקנון והצמדות: הסדרת רכוש משותף, מה ניתן ומה לא ניתן להצמיד",
          "התנהלות מוסדית: תשריט מודד, עבודה מול לשכת הרישום והמפקח, והכשרת מבנים ללא היתר",
          "תרגול מעשי: ניתוח צו רישום אמיתי, ניסוח תקנון מוסכם ל 4 יחידות והכנת בקשה לתיקון",
        ],
        packageId: PACKAGE_ID,
        earlyPrice: p?.earlyPrice ?? 1080,
        regularPrice: p?.regularPrice ?? 1440,
        risen: p?.risen ?? false,
      }}
    />
  );
}
