"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { backdropSrcSet, backdropUrl, posterUrl } from "@/lib/tmdb/images";
import type { Palette } from "@/lib/types";

/**
 * The film taking over the screen.
 *
 * Fixed and full-viewport, behind everything, escaping the page's measure
 * entirely — a backdrop that stops at a content gutter is a header image, not
 * an atmosphere. Three layers stack up:
 *
 *   ambient  a heavily blurred, over-scaled wash that bleeds the film's light
 *            into the edges of the screen
 *   still    the actual TMDB backdrop, drifting slowly (Ken Burns)
 *   scrim    gradients in the film's own background colour, so the image
 *            dissolves into the page rather than ending at a hard edge
 *
 * Crossfades are keyed on the film, so changing pick fades one still out while
 * the next fades in rather than cutting.
 */
export function FilmBackdrop({
  tmdbId,
  backdropPath,
  posterPath,
  palette,
  /** Nudged by drag direction, so the image leans with the gesture. */
  drift = 0,
}: {
  tmdbId: number;
  backdropPath: string | null;
  posterPath: string | null;
  palette: Palette | null;
  drift?: number;
}) {
  // Films with no wide still fall back to the poster for the ambient wash
  // only — blurred past recognition, it reads as light rather than as a
  // stretched portrait.
  const still = backdropUrl(backdropPath, "w1280");
  const ambientSource = still ?? posterUrl(posterPath, "w342");
  const ground = palette?.background ?? "var(--bg)";

  // The global reduced-motion rule in globals.css only reaches CSS animations;
  // inline transitions have to opt out themselves. A slow drift is exactly the
  // kind of continuous background movement that rule exists for.
  const reduced = useReducedMotion();

  /*
   * One viewport tall, anchored to the top — never the height of the page.
   *
   * This is the fix for the backdrop reading as a giant stretched still. A
   * 16:9 image stretched to `inset-0` of a long scrolling article gets cropped
   * to a sliver of its width, which is why Zodiac was a close-up of one face
   * instead of a foggy bridge. Bounded to the viewport, the image is shown at
   * roughly its own aspect ratio and stays a *place* rather than a portrait.
   */
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-dvh overflow-hidden"
      aria-hidden
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={tmdbId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: [0.22, 0.61, 0.36, 1] }}
          className="absolute inset-0"
        >
          {ambientSource && (
            <img
              src={ambientSource}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-55 blur-3xl saturate-150"
            />
          )}

          {still && (
            <motion.img
              src={still}
              srcSet={backdropSrcSet(backdropPath)}
              sizes="100vw"
              alt=""
              aria-hidden
              // Slow, continuous drift. Long enough that you never catch it
              // moving — you only notice the frame is not dead.
              // Barely any zoom. The drift exists so the frame is not dead,
              // not to push further into the image — every extra percent of
              // scale is another crop toward a close-up.
              initial={{ scale: 1.0, x: 0, y: 0 }}
              animate={
                reduced ? { scale: 1.0, x: 0, y: 0 } : { scale: 1.05, x: drift * 12, y: -6 }
              }
              transition={
                reduced
                  ? { duration: 0 }
                  : {
                      scale: { duration: 34, ease: "linear" },
                      x: { type: "spring", stiffness: 60, damping: 20 },
                      y: { duration: 34, ease: "linear" },
                    }
              }
              // Softened and dropped back. The poster is the sharp object on
              // this page; the backdrop is the air around it, and two competing
              // sharp images at this scale is what made it read as wallpaper.
              // Blur is what creates the separation, not darkness. A sharp
              // poster in front of a defocused image reads as depth; a sharp
              // poster in front of a merely dimmer sharp image reads as two
              // pictures fighting, which is what "just make it darker" gets you.
              className="absolute inset-0 h-full w-full object-cover blur-[7px]"
              style={{ opacity: 0.34 }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Ambient wash.
          A breath of the film's own accent, sitting between the image and the
          scrim. This is what makes Zodiac feel cold blue-green and The
          Godfather feel warm amber without theming the interface — the light
          in the room changes, the room does not. */}
      {palette && (
        <div
          className="absolute inset-0 mix-blend-soft-light"
          style={{
            background: `radial-gradient(120% 90% at 50% 35%, ${palette.accent} 0%, transparent 70%)`,
            opacity: 0.5,
          }}
        />
      )}

      {/* Scrim, in three directions.
          Vertical to ground the composition and carry the text at the bottom,
          horizontal to pull the edges in, and a vignette to stop the corners
          competing. Layered rather than a single flat overlay — one uniform
          darkening mutes the image without ever creating separation, which is
          the muddy result of "just make it darker". */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(to bottom,
              rgb(var(--bg-rgb) / 0.62) 0%,
              rgb(var(--bg-rgb) / 0.28) 22%,
              rgb(var(--bg-rgb) / 0.55) 55%,
              rgb(var(--bg-rgb) / 0.88) 80%,
              ${ground} 100%),
            linear-gradient(to right,
              rgb(var(--bg-rgb) / 0.75) 0%,
              rgb(var(--bg-rgb) / 0.1) 30%,
              rgb(var(--bg-rgb) / 0.1) 70%,
              rgb(var(--bg-rgb) / 0.75) 100%),
            radial-gradient(120% 95% at 50% 32%, transparent 35%, rgb(var(--bg-rgb) / 0.6) 100%),
            radial-gradient(38% 34% at 50% 30%, rgb(var(--bg-rgb) / 0.72) 0%, transparent 100%)
          `,
        }}
      />
    </div>
  );
}
