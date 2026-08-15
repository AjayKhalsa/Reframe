/**
 * Taste scoring.
 *
 * What survives of the earlier recommendation engine, and all that is still
 * wanted: a way to order a set of films by how well they suit the person
 * looking at them. Discover's shelves and the watchlist both need that.
 *
 * Deliberately *not* a recommender any more. Choosing what to watch is the
 * universe's job now — you find films by moving through the space and by their
 * neighbours, not by being handed a ranked list. This module only answers
 * "given these films, which order?", which is a much smaller question.
 */

import { allMovies } from "../data/movies";
import { ratedMovies } from "../mock/session";
import type { Movie } from "../types";
import { buildProfile, scoreMovie, toFit, type Scored } from "./profile";

/**
 * Scores films against the current taste profile, best first.
 *
 * The profile is rebuilt per call. At this catalogue size that is microseconds,
 * and caching it would mean a rating not showing up until something invalidated
 * the cache — a worse trade than the work it saves.
 */
export function rankAll(movies: Movie[] = allMovies()): Scored[] {
  const profile = buildProfile(ratedMovies, allMovies());
  return movies.map((movie) => scoreMovie(movie, profile)).sort((a, b) => b.score - a.score);
}

export { toFit };
