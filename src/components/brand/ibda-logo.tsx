import { cn } from "@/lib/utils";

/**
 * Text-based wordmark — replaces the Lovable-hosted raster logo, which isn't
 * reachable outside the Lovable platform. Swap for a real <img> once a logo
 * file is supplied.
 */
export function IbdaLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-baseline gap-1 font-serif select-none", className)}
      aria-label="IBDA"
    >
      <span className="text-gold font-medium tracking-tight">IBDA</span>
    </span>
  );
}
