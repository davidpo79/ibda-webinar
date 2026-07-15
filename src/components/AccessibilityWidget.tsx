import { useEffect, useRef, useState } from "react";
import { Accessibility, X } from "lucide-react";
import { cn } from "@/lib/utils";

type A11ySettings = {
  fontScale: number;
  highContrast: boolean;
  grayscale: boolean;
  underlineLinks: boolean;
  stopAnimations: boolean;
  strongFocus: boolean;
};

const DEFAULT_SETTINGS: A11ySettings = {
  fontScale: 1,
  highContrast: false,
  grayscale: false,
  underlineLinks: false,
  stopAnimations: false,
  strongFocus: false,
};

const FONT_SCALE_STEPS = [1, 1.15, 1.3, 1.45];
const STORAGE_KEY = "ibda:a11y-settings";

function loadSettings(): A11ySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Floating, persistent (localStorage) accessibility toolbar — mounted once
// in the root layout so it's present on every page including the admin
// panel. Applies its effects directly to <html> (font-size percentage for
// text scaling so every rem-based Tailwind size scales with it; classes for
// the rest, defined in styles.css) rather than through component state, so
// the settings survive full page navigations without a page flash.
export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<A11ySettings>(DEFAULT_SETTINGS);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.style.fontSize = settings.fontScale === 1 ? "" : `${settings.fontScale * 100}%`;
    html.classList.toggle("a11y-contrast", settings.highContrast);
    html.classList.toggle("a11y-grayscale", settings.grayscale);
    html.classList.toggle("a11y-underline-links", settings.underlineLinks);
    html.classList.toggle("a11y-no-motion", settings.stopAnimations);
    html.classList.toggle("a11y-strong-focus", settings.strongFocus);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore — accessibility preferences just won't persist across visits
    }
  }, [settings]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  function toggle(key: keyof Omit<A11ySettings, "fontScale">) {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  }

  function cycleFontScale() {
    setSettings((s) => {
      const idx = FONT_SCALE_STEPS.indexOf(s.fontScale);
      return { ...s, fontScale: FONT_SCALE_STEPS[(idx + 1) % FONT_SCALE_STEPS.length] };
    });
  }

  return (
    <div dir="rtl" className="fixed bottom-4 left-4 z-[100]">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label="פתיחת תפריט נגישות"
        className="w-12 h-12 rounded-full bg-gold text-ink shadow-lg flex items-center justify-center hover:bg-gold-deep transition-colors focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-ink"
      >
        <Accessibility className="w-6 h-6" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="a11y-panel"
          ref={panelRef}
          role="region"
          aria-label="תפריט נגישות"
          className="absolute bottom-16 left-0 w-72 rounded-xl border border-cream/15 bg-ink shadow-2xl p-4 space-y-2.5"
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-cream">נגישות</h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label="סגירת תפריט נגישות"
              className="text-muted-brown hover:text-gold transition-colors p-1"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={cycleFontScale}
            className="w-full flex items-center justify-between gap-2 rounded-md border border-cream/15 px-3 py-2 text-sm text-cream hover:border-gold/50 transition-colors"
          >
            <span>גודל טקסט</span>
            <span className="text-gold text-xs ltr-inline">
              {Math.round(settings.fontScale * 100)}%
            </span>
          </button>

          <A11yToggle
            label="ניגודיות גבוהה"
            active={settings.highContrast}
            onClick={() => toggle("highContrast")}
          />
          <A11yToggle
            label="גווני אפור"
            active={settings.grayscale}
            onClick={() => toggle("grayscale")}
          />
          <A11yToggle
            label="הדגשת קישורים"
            active={settings.underlineLinks}
            onClick={() => toggle("underlineLinks")}
          />
          <A11yToggle
            label="עצירת אנימציות"
            active={settings.stopAnimations}
            onClick={() => toggle("stopAnimations")}
          />
          <A11yToggle
            label="הדגשת מוקד מקלדת"
            active={settings.strongFocus}
            onClick={() => toggle("strongFocus")}
          />

          <div className="flex items-center justify-between pt-2 mt-1 border-t border-cream/10">
            <button
              type="button"
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              className="text-xs text-muted-brown hover:text-gold transition-colors"
            >
              איפוס הגדרות
            </button>
            <a href="/accessibility" className="text-xs text-gold hover:underline">
              הצהרת נגישות
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function A11yToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
        active
          ? "border-gold bg-gold/10 text-gold"
          : "border-cream/15 text-cream hover:border-gold/50",
      )}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "w-8 h-4 rounded-full relative transition-colors shrink-0",
          active ? "bg-gold" : "bg-cream/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-3 h-3 rounded-full bg-ink",
            active ? "right-0.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
