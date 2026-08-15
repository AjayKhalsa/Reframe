/**
 * Editorial summary of a taste profile.
 *
 * The plan is explicit that this must not show fake precision — "Comedy 83.72%"
 * is both meaningless and off-putting. So everything here returns ranked labels
 * and ranges rather than numbers, and the one number that does exist (the
 * runtime sweet spot) is a genuine interquartile range of films the user
 * actually rated well.
 */

import { allMovies } from "../data/movies";
import { ratedMovies, watchlist } from "../mock/session";
import { buildProfile, describeFeature, isUsefulKeyword } from "./profile";

/** Ratings at or above this count as "loved" for the purposes of the summary. */
const LOVED_THRESHOLD = 4;

export type TasteSummary = {
  headline: string;
  genres: string[];
  themes: string[];
  directors: string[];
  eras: string[];
  runtimeSweetSpot: { low: number; high: number } | null;
  counts: { rated: number; loved: number; watchlist: number };
};

function topFeatures(
  features: Map<string, number>,
  family: string,
  limit: number,
): string[] {
  return [...features.entries()]
    .filter(([key, weight]) => key.startsWith(`${family}:`) && weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => describeFeature(key))
    .filter((label): label is string => Boolean(label));
}

/**
 * Interquartile range of the runtimes the user rates well.
 *
 * Quartiles rather than min/max because one three-hour favourite should not
 * widen the "sweet spot" to cover everything ever made.
 */
function runtimeSweetSpot(runtimes: number[]): { low: number; high: number } | null {
  if (runtimes.length < 4) return null;
  const sorted = [...runtimes].sort((a, b) => a - b);
  const at = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];

  const low = at(0.25);
  const high = at(0.75);
  // Round outward to the nearest five minutes — a range of "1h 43m to 2h 07m"
  // implies a precision that a dozen ratings cannot support.
  return { low: Math.floor(low / 5) * 5, high: Math.ceil(high / 5) * 5 };
}

/**
 * One sentence describing the person.
 *
 * Assembled from the profile's own top signals rather than picked from a list
 * of stock personalities, so it stays true as the ratings change.
 */
function headlineFor(genres: string[], themes: string[]): string {
  if (genres.length === 0) return "Not enough ratings yet to say much. Rate a few films and this fills in.";

  const primary = genres[0];
  const theme = themes[0];

  if (theme) {
    return `You lean ${primary}, and you keep coming back to ${theme}.`;
  }
  return `You lean ${primary}, fairly consistently.`;
}

export function summariseTaste(): TasteSummary {
  const catalogue = allMovies();
  const profile = buildProfile(ratedMovies, catalogue);

  const genres = topFeatures(profile.features, "genre", 4);
  const themes = topFeatures(profile.features, "keyword", 6).filter(isUsefulKeyword);
  const directors = topFeatures(profile.features, "director", 3);
  const eras = topFeatures(profile.features, "era", 3);

  const loved = ratedMovies.filter((r) => r.rating.value >= LOVED_THRESHOLD);
  const runtimes = loved
    .map((r) => r.movie.runtime)
    .filter((runtime): runtime is number => Boolean(runtime));

  return {
    headline: headlineFor(genres, themes),
    genres,
    themes,
    directors,
    eras,
    runtimeSweetSpot: runtimeSweetSpot(runtimes),
    counts: {
      rated: ratedMovies.length,
      loved: loved.length,
      watchlist: watchlist.length,
    },
  };
}
