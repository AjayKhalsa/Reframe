"use client";

import { cn } from "@/lib/cn";
import { posterSrcSet, posterUrl } from "@/lib/tmdb/images";
import type { Palette } from "@/lib/types";
import { useImageLoaded } from "./useImageLoaded";

type PosterProps = {
  path: string | null | undefined;
  title: string;
  /** Drives the `sizes` hint, so the browser fetches the right width. */
  sizes?: string;
  /** Tint for the placeholder shown before the image decodes. */
  palette?: Palette | null;
  priority?: boolean;
  className?: string;
};

/**
 * A film poster.
 *
 * Not `next/image`: TMDB serves pre-sized derivatives from its own CDN and
 * their terms expect you to use them, so routing bytes through Next's
 * optimiser would add a hop and re-encode artwork that is already optimal.
 * What we do need — correct aspect ratio, a `srcset`, and a placeholder that
 * isn't a grey box — is all here.
 */
export function Poster({
  path,
  title,
  sizes = "(min-width: 768px) 220px, 40vw",
  palette,
  priority = false,
  className,
}: PosterProps) {
  const src = posterUrl(path, "w500");
  const { ref, loaded, onLoad } = useImageLoaded(src);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-surface",
        // A hairline inset rather than a border: posters are printed objects
        // and this reads as the edge of the card stock, not a UI stroke.
        "shadow-[0_1px_0_0_rgb(var(--text-rgb)/0.14)_inset,0_18px_40px_-24px_rgb(0_0_0/0.9)]",
        className,
      )}
      style={{
        aspectRatio: "2 / 3",
        borderRadius: "var(--radius-poster)",
        // Tinting the placeholder with the film's own palette means the
        // load-in reads as the image resolving rather than a box being filled.
        backgroundColor: palette?.surface ?? undefined,
      }}
    >
      {src ? (
        <img
          ref={ref}
          src={src}
          srcSet={posterSrcSet(path)}
          sizes={sizes}
          alt={`${title} poster`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={onLoad}
          onError={onLoad}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionTimingFunction: "var(--ease)" }}
        />
      ) : (
        <PosterFallback title={title} />
      )}

      {src && !loaded && <div className="shimmer absolute inset-0" aria-hidden />}
    </div>
  );
}

/**
 * Stand-in for films TMDB has no artwork for.
 *
 * Set the title in the display serif rather than showing a broken-image glyph —
 * a missing poster should still look like part of the product.
 */
function PosterFallback({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-end p-3">
      <span className="font-display text-ink/70 text-lg leading-tight">{title}</span>
    </div>
  );
}

/** Loading placeholder matching Poster's footprint, for suspense boundaries. */
export function PosterSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("shimmer bg-surface", className)}
      style={{ aspectRatio: "2 / 3", borderRadius: "var(--radius-poster)" }}
      aria-hidden
    />
  );
}
