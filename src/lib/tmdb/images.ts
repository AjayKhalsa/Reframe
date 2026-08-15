/**
 * TMDB image URL construction.
 *
 * Per TMDB's terms we never rehost their artwork — we store the path and serve
 * from their CDN. Sizes are the fixed set TMDB exposes; asking for an arbitrary
 * width silently 404s, so these unions exist to stop that at compile time.
 */

const IMAGE_BASE = "https://image.tmdb.org/t/p";

export type PosterSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original";
export type BackdropSize = "w300" | "w780" | "w1280" | "original";
export type ProfileSize = "w45" | "w185" | "h632" | "original";

function url(size: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path}`;
}

export const posterUrl = (path: string | null | undefined, size: PosterSize = "w500") =>
  url(size, path);

export const backdropUrl = (path: string | null | undefined, size: BackdropSize = "w1280") =>
  url(size, path);

export const profileUrl = (path: string | null | undefined, size: ProfileSize = "w185") =>
  url(size, path);

/**
 * `srcset` for a poster. Posters render at wildly different sizes across the
 * app (a 64px watchlist thumb, a full-bleed hero) and shipping w500 to all of
 * them is the single biggest bandwidth win available on mobile.
 */
export function posterSrcSet(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return (["w154", "w342", "w500", "w780"] as const)
    .map((size) => `${IMAGE_BASE}/${size}${path} ${size.slice(1)}w`)
    .join(", ");
}

export function backdropSrcSet(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return (["w780", "w1280", "original"] as const)
    .map((size, i) => `${IMAGE_BASE}/${size}${path} ${[780, 1280, 1920][i]}w`)
    .join(", ");
}
