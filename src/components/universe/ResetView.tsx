"use client";

import { useUniverse } from "./UniverseProvider";

/**
 * A way back out.
 *
 * Free orbiting in a space with no horizon means people get lost — that is not
 * a flaw to design away, it is what exploring is, but it does need an exit.
 * Deliberately the quietest control on screen: it should be findable when you
 * want it and invisible when you don't.
 */
export function ResetView() {
  const { resetView } = useUniverse();

  return (
    <button
      type="button"
      onClick={resetView}
      className="text-muted hover:text-ink pointer-events-auto flex items-center gap-2 text-[0.625rem] tracking-[0.14em] uppercase transition-colors"
    >
      Reset view
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        <circle
          cx="8"
          cy="8"
          r="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
          opacity="0.5"
        />
        <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      </svg>
    </button>
  );
}
