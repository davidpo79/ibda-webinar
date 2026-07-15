import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/accessibility")({
  head: () => ({
    meta: [
      { title: "הצהרת נגישות · IBDA" },
      {
        name: "description",
        content: "הצהרת הנגישות של אתר IBDA — משרד עורכי דין בן דוד עמית.",
      },
    ],
  }),
  component: AccessibilityStatementPage,
});

const STATEMENT_DATE = "15.7.2026";
const CONTACT_EMAIL = "webinar@ibda-law.com";

function AccessibilityStatementPage() {
  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="font-serif text-xl text-gold">הצהרת נגישות</h1>
          <Link to="/" className="text-sm text-muted-brown hover:text-gold transition-colors">
            חזרה לאתר
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-[15px] leading-relaxed text-cream/90">
        <p>
          משרד עורכי דין בן דוד עמית (IBDA) רואה חשיבות רבה במתן שירות שוויוני ונגיש לכלל הגולשים
          והגולשות באתר, לרבות אנשים עם מוגבלות, ופועל להנגשת האתר בהתאם לתקנות שוויון זכויות לאנשים
          עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, ובהתבסס על התקן הישראלי (ת"י 5568)
          ועקרונות הנחיות הנגישות לתכני אינטרנט (WCAG) 2.0 ברמה AA.
        </p>

        <section className="space-y-3">
          <h2 className="font-serif text-lg text-gold">מה נעשה באתר להנגשתו</h2>
          <ul className="list-disc pr-5 space-y-2 text-cream/80">
            <li>
              תפריט נגישות ייעודי (הכפתור הצף בפינת המסך) המאפשר הגדלת טקסט, ניגודיות גבוהה, גווני
              אפור, הדגשת קישורים, עצירת אנימציות והדגשת מוקד המקלדת — ההגדרות נשמרות לביקורים
              הבאים.
            </li>
            <li>תמיכה מלאה בכיוון כתיבה מימין לשמאל (RTL) ובשפה העברית.</li>
            <li>אפשרות ניווט וניתוב מלא באמצעות מקלדת בכל רכיבי האתר, כולל טפסים ותפריטים.</li>
            <li>תיוגי ARIA ותיאורי טקסט חלופיים (alt) לתמונות ולרכיבים גרפיים.</li>
            <li>מבנה כותרות היררכי וברור המאפשר ניווט נוח באמצעות טכנולוגיות מסייעות.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-lg text-gold">מגבלות ידועות</h2>
          <p className="text-cream/80">
            חרף מאמצינו, ייתכן שבחלקים מסוימים באתר — למשל בעמוד הסליקה של ספק התשלומים החיצוני — לא
            הושגה נגישות מלאה. אנו ממשיכים לפעול לשיפור מתמיד של נגישות האתר.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-lg text-gold">פנייה בנושא נגישות</h2>
          <p className="text-cream/80">
            נתקלתם בבעיית נגישות באתר, או שיש לכם הצעה לשיפור? נשמח שתפנו אלינו ונטפל בפנייה בהקדם
            האפשרי:
          </p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline ltr-inline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>

        <p className="text-cream/60 text-sm pt-4 border-t border-border/60">
          הצהרת נגישות זו עודכנה לאחרונה בתאריך {STATEMENT_DATE}.
        </p>
      </main>
    </div>
  );
}
