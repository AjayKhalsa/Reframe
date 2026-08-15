"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useUniverse } from "./UniverseProvider";

/**
 * The way out of a film, and back into the universe.
 *
 * Two doors that behave differently on purpose:
 *
 *   Back           returns to exactly the view you left, whatever it was —
 *                  the camera is untouched, so this is a pure undo
 *   Explore nearby returns *and* flies to this film, so you come out of the
 *                  page standing in its neighbourhood
 *
 * Selecting the film on mount is what makes the second one work: by the time
 * the canvas is visible again the selection is already set, so the
 * neighbourhood is lit rather than appearing a beat later.
 */
export function ReturnControls({ tmdbId }: { tmdbId: number }) {
  const router = useRouter();
  const { select, flyTo, byId } = useUniverse();

  // Keep the universe's selection in step with whatever film is open, so
  // arriving here from a link — not just from the map — still leaves the map
  // pointing at the right place.
  useEffect(() => {
    if (byId.has(tmdbId)) select(tmdbId);
  }, [tmdbId, byId, select]);

  const inUniverse = byId.has(tmdbId);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-muted hover:text-ink text-[0.6875rem] tracking-[0.14em] uppercase transition-colors"
      >
        ← Back
      </button>

      {inUniverse && (
        <button
          type="button"
          onClick={() => {
            flyTo(tmdbId);
            router.push("/");
          }}
          className="text-accent text-[0.6875rem] tracking-[0.14em] uppercase transition-opacity hover:opacity-70"
        >
          Explore nearby →
        </button>
      )}
    </div>
  );
}
