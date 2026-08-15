import { cache } from "react";

import { paletteForPoster } from "../palette/server";
import { getMovie, TmdbError } from "../tmdb/client";
import type { Movie } from "../types";
import { getMappedFilm } from "./films";
import { getMovieById } from "./movies";

/** Distinguishes "TMDB is unreachable" from "no such film". */
export class UpstreamUnavailable extends Error {}

/**
 * Resolves a film by TMDB id.
 *
 * Three tiers, cheapest first: the seeded demo catalogue, then the detail
 * records written for every mapped film, then a live TMDB fetch for anything
 * else — a search result, a shared link to something off the map.
 *
 * `cache()` dedupes within a request, so a page resolving the same film in
 * both `generateMetadata` and the component pays once.
 *
 * Returns `null` **only** when the film genuinely does not exist. A network
 * failure throws instead. That distinction is the whole point: this used to
 * swallow every error and return null, so a dropped connection rendered as
 * "This page could not be found" for a film that was simply unreachable for a
 * moment. A 404 is a statement of fact and should never be guesswork.
 */
export const resolveMovie = cache(async (tmdbId: number): Promise<Movie | null> => {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  const seeded = getMovieById(tmdbId);
  if (seeded) return seeded;

  const mapped = await getMappedFilm(tmdbId);
  if (mapped) {
    // Mapped records carry no palette — deriving one per film at projection
    // time would mean thousands of image downloads. It is computed here on
    // first view and cached by Next thereafter.
    if (!mapped.palette) mapped.palette = await paletteForPoster(mapped.posterPath);
    return mapped;
  }

  try {
    const movie = await getMovie(tmdbId);
    movie.palette = await paletteForPoster(movie.posterPath);
    return movie;
  } catch (error) {
    // TMDB itself saying "no such film" is the one case that is really a 404.
    if (error instanceof TmdbError && error.status === 404) return null;

    throw new UpstreamUnavailable(
      `Could not reach TMDB for film ${tmdbId}`,
      { cause: error },
    );
  }
});
