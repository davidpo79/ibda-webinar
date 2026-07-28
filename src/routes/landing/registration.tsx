import { createFileRoute } from "@tanstack/react-router";
import { getScheduleData } from "@/lib/schedule.functions";
import { formatSessionDate } from "@/lib/format-date";
import { buildSessionOgDescription } from "@/lib/social-meta";
import { PackageLandingPage } from "@/components/PackageLandingPage";

const PACKAGE_ID = "premium_registration";
const TITLE = "רישום בית משותף";
const DESC = "ניהול ההליך השלם לרישום והסדרת זכויות בבתים משותפים.";
const PAGE_TITLE = "רישום בית משותף · סדנת פרימיום · IBDA";

export const Route = createFileRoute("/landing/registration")({
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
  component: RegistrationWorkshopLanding,
});

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
        title: TITLE,
        desc: DESC,
        topics: [
          "מסמכי הבית המשותף - מבוא",
          "ניסוח התקנון, תקנון מצוי למול תקנון מוסכם ומשמעויות",
          "הבקשה לרישום בית משותף",
          "תיקון הרישום",
        ],
        packageId: PACKAGE_ID,
        earlyPrice: p?.earlyPrice ?? 1080,
        regularPrice: p?.regularPrice ?? 1440,
        risen: p?.risen ?? false,
        durationLabel: "4 שעות",
      }}
    />
  );
}
