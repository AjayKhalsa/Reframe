"use client";

import { useState } from "react";
import Link from "next/link";

import { Poster } from "@/components/ui/Poster";
import { cn } from "@/lib/cn";
import { metaLine } from "@/lib/format";
import type { Movie } from "@/lib/types";

/** Past this age we stop assuming the user still intends to watch it. */
export const STALE_AFTER_DAYS = 180;

/**
 * One watchlist entry.
 *
 * Old entries get the decay prompt inline rather than in a modal — the whole
 * point is to make pruning cost nothing, and a dialog per film would cost far
 * more than leaving the list to rot.
 */
export function WatchlistRow({
  movie,
  fit,
  ageInDays,
  note,
}: {
  movie: Movie;
  fit?: number;
  ageInDays: number;
  /** Short reason this row is in the section it's in. */
  note?: string;
}) {
  const [resolution, setResolution] = useState<"kept" | "removed" | null>(null);

  if (resolution === "removed") return null;

  const stale = ageInDays >= STALE_AFTER_DAYS && resolution === null;

  return (
    <div className="py-4" style={{ borderTop: "1px solid var(--hairline)" }}>
      <div className="flex gap-4">
        <Link href={`/movie/${movie.tmdbId}`} className="w-[3.75rem] shrink-0">
          <Poster
            path={movie.posterPath}
            title={movie.title}
            palette={movie.palette}
            sizes="60px"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <Link
              href={`/movie/${movie.tmdbId}`}
              className="text-ink hover:text-accent truncate text-[0.9375rem] font-medium transition-colors duration-200"
            >
              {movie.title}
            </Link>
            {fit !== undefined && (
              <span className="text-accent shrink-0 text-xs font-medium tabular-nums">
                {fit}
              </span>
            )}
          </div>

          <p className="meta mt-0.5 truncate">{metaLine(movie, { maxGenres: 2 })}</p>

          {note && <p className="text-muted mt-1.5 text-xs">{note}</p>}

          {stale && <DecayPrompt ageInDays={ageInDays} onResolve={setResolution} />}
        </div>
      </div>
    </div>
  );
}

function DecayPrompt({
  ageInDays,
  onResolve,
}: {
  ageInDays: number;
  onResolve: (value: "kept" | "removed") => void;
}) {
  const months = Math.round(ageInDays / 30);

  return (
    <div className="mt-3">
      <p className="text-muted text-xs">
        Added {months} months ago. Still want to watch this?
      </p>
      <div className="mt-2 flex gap-2">
        <DecayButton onClick={() => onResolve("kept")}>Definitely</DecayButton>
        <DecayButton onClick={() => onResolve("kept")}>Maybe</DecayButton>
        <DecayButton onClick={() => onResolve("removed")}>Remove</DecayButton>
      </div>
    </div>
  );
}

function DecayButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "text-muted hover:text-ink min-h-9 px-3 text-xs",
        "border border-[var(--hairline)] transition-colors duration-200 hover:border-[var(--hairline-strong)]",
        className,
      )}
      style={{ borderRadius: "var(--radius-pill)" }}
    />
  );
}
