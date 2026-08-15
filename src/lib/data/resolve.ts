import { cache } from "react";

import { paletteForPoster } from "../palette/server";
import { getMovie } from "../tmdb/client";
import type { Movie } from "../types";
import { getMovieById } from "./movies";

/**
 * Resolves a film by TMDB id, from the local cache or from TMDB.
 *
 * The seeded catalogue is the fast path; anything else — a search result, a
 * shared link — is fetched live and given a palette so it is indistinguishable
 * from a seeded film once rendered.
 *
 * `cache()` dedupes within a single request, so a page that resolves the same
 * film in both `generateMetadata` and the component itself pays for one fetch,
 * not two.
 */
export const resolveMovie = cache(async (tmdbId: number): Promise<Movie | null> => {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  const cached = getMovieById(tmdbId);
  if (cached) return cached;

  try {
    const movie = await getMovie(tmdbId);
    movie.palette = await paletteForPoster(movie.posterPath);
    return movie;
  } catch {
    // A bad id and an unreachable TMDB are the same thing to the caller: no
    // film. The page turns that into a 404.
    return null;
  }
});
