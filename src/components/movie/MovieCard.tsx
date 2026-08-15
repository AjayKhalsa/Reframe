"use client";

import Link from "next/link";

import { Poster } from "@/components/ui/Poster";
import { cn } from "@/lib/cn";
import { metaLine } from "@/lib/format";
import type { MovieSummary } from "@/lib/types";

/**
 * A film in a rail or grid.
 *
 * The caption sits under the poster rather than over it. Overlaid titles need a
 * scrim, the scrim fights the artwork, and the artwork is the reason anyone is
 * looking — so the poster stays clean and the words go beneath it.
 */
export function MovieCard({
  movie,
  width = "w-[8.5rem] sm:w-[10rem]",
  fit,
  priority,
  className,
}: {
  movie: MovieSummary;
  /** Tailwind width class. Rails and grids want different footprints. */
  width?: string;
  /** Optional predicted fit, shown as a quiet accent numeral. */
  fit?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/movie/${movie.tmdbId}`}
      className={cn("group block", width, className)}
      // The poster lifting slightly is the only hover affordance — enough to
      // read as interactive, not so much that a grid becomes restless.
    >
      <div className="transition-transform duration-300 group-hover:-translate-y-1" style={{ transitionTimingFunction: "var(--ease)" }}>
        <Poster
          path={movie.posterPath}
          title={movie.title}
          palette={movie.palette}
          priority={priority}
          sizes="(min-width: 640px) 160px, 136px"
        />
      </div>

      <div className="mt-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-ink truncate text-[0.9375rem] leading-snug font-medium">
            {movie.title}
          </h3>
          {fit !== undefined && (
            <span className="text-accent shrink-0 text-xs font-medium tabular-nums">
              {Math.round(fit)}
            </span>
          )}
        </div>
        <p className="meta mt-0.5 truncate">{metaLine(movie, { maxGenres: 1 })}</p>
      </div>
    </Link>
  );
}
