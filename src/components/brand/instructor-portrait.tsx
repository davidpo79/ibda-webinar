import { cn } from "@/lib/utils";

/**
 * Editorial monogram treatment — stands in for the instructor photograph
 * until a real portrait file is supplied. Swap the returned markup for an
 * <img src="..."> once available; the parent (`Hero` in routes/index.tsx)
 * already sizes/frames whatever this renders.
 */
export function InstructorPortrait({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-sand-warm via-sand to-ink",
        className,
      )}
      role="img"
      aria-label="עו״ד יפעת בן דוד עמית"
    >
      <span className="font-serif text-[5.5rem] leading-none text-gold/90 tracking-tight">
        י<span className="text-gold/50">.</span>ב
      </span>
    </div>
  );
}
