import { Masthead } from "@/components/editorial/Masthead";

/**
 * Frame for the secondary pages — Discover, Archive, Watchlist, Search.
 *
 * The universe has no shell at all; it fills the viewport and supplies its own
 * chrome. These pages are the supporting material around it, so they get a
 * small top navigation and a text measure, and nothing else.
 *
 * Horizontal padding and the `--gutter` token both come from `.app-frame` in
 * globals.css so rails always bleed by exactly the padding they sit inside.
 */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh">
      <div className="app-frame mx-auto w-full max-w-6xl">
        <Masthead />
      </div>
      <div className={`app-frame mx-auto w-full max-w-6xl pb-20 ${className ?? ""}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * Kept as an alias so the secondary pages did not all need touching when the
 * shell grew a navigation. Prefer `PageShell` in new code.
 */
export const Measure = PageShell;
