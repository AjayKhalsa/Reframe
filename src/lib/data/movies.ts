/**
 * Access to the locally cached film records.
 *
 * `movies.json` is written by `npm run seed` from TMDB. In Phase 3 this module
 * becomes the seam where the cache moves to Postgres — callers only ever see
 * these functions, never the JSON.
 */

import type { Movie, MovieSummary } from "../types";
import raw from "./movies.json";

const MOVIES = raw as unknown as Movie[];

const BY_ID = new Map(MOVIES.map((movie) => [movie.tmdbId, movie]));

export function allMovies(): Movie[] {
  return MOVIES;
}

export function getMovieById(tmdbId: number): Movie | undefined {
  return BY_ID.get(tmdbId);
}

/** Case-insensitive title lookup, for wiring demo data by name. */
export function getMovieByTitle(title: string): Movie | undefined {
  const needle = title.toLowerCase();
  return MOVIES.find((movie) => movie.title.toLowerCase() === needle);
}

export function toSummary(movie: Movie): MovieSummary {
  return {
    tmdbId: movie.tmdbId,
    title: movie.title,
    releaseDate: movie.releaseDate,
    runtime: movie.runtime,
    genres: movie.genres,
    posterPath: movie.posterPath,
    backdropPath: movie.backdropPath,
    palette: movie.palette,
  };
}
