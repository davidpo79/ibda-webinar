import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { AccessibilityWidget } from "@/components/AccessibilityWidget";
import { META_PIXEL_ID, META_PIXEL_SNIPPET, trackMeta } from "@/lib/meta";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: 'IBDA | סדרת וובינרים בעסקאות נדל"ן וליטיגציה' },
      {
        name: "description",
        content:
          "סדרת וובינרים מקצועית לעורכי דין בגישת Deal Flow, מהשיחה הראשונה עם הלקוח ועד השלמת רישום הזכויות, בשילוב כלי בינה מלאכותית ופרקטיקה יישומית.",
      },
      { name: "author", content: "IBDA" },
      { property: "og:title", content: 'IBDA | סדרת וובינרים בעסקאות נדל"ן וליטיגציה' },
      {
        property: "og:description",
        content:
          "סדרת וובינרים מקצועית לעורכי דין בגישת Deal Flow, מהשיחה הראשונה עם הלקוח ועד השלמת רישום הזכויות, בשילוב כלי בינה מלאכותית ופרקטיקה יישומית.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: 'IBDA | סדרת וובינרים בעסקאות נדל"ן וליטיגציה' },
      {
        name: "twitter:description",
        content:
          "סדרת וובינרים מקצועית לעורכי דין בגישת Deal Flow, מהשיחה הראשונה עם הלקוח ועד השלמת רישום הזכויות, בשילוב כלי בינה מלאכותית ופרקטיקה יישומית.",
      },
      {
        property: "og:image",
        content: "https://web-production-8c2b1.up.railway.app/og-image.jpg",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        name: "twitter:image",
        content: "https://web-production-8c2b1.up.railway.app/og-image.jpg",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
        {/* Meta pixel base code. Lives in <head>, not a route's head(), so it
            loads once on first paint regardless of which page was entered
            from — a client-side route change afterwards only needs a plain
            PageView call (see useMetaPageView below), not a re-init. */}
        <script dangerouslySetInnerHTML={{ __html: META_PIXEL_SNIPPET }} />
      </head>
      <body>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// The base snippet's own `fbq('track','PageView')` only covers the very
// first load. TanStack Router navigates client-side after that without a
// full page reload, so every route change past the first needs its own
// PageView call or Events Manager only ever sees one per visit.
function useMetaPageView() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    trackMeta("PageView");
  }, [pathname]);
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useMetaPageView();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {/* Every toast.success()/toast.error() call site-wide renders through
          this single instance — without it, those calls are silent no-ops. */}
      <Toaster richColors position="top-center" dir="rtl" />
      <AccessibilityWidget />
    </QueryClientProvider>
  );
}
