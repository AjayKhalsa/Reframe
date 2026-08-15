/**
 * A stand-in for the signed-in user.
 *
 * Phase 3 replaces this wholesale with Supabase auth plus the real `ratings`
 * and `watchlists` tables. Until then every surface reads from here, so there
 * is exactly one place to delete when the real thing lands.
 *
 * The taste encoded below is deliberately specific rather than average —
 * character-driven crime, ambition, sharp dialogue, a soft spot for a well-made
 * comedy — because a recommendation engine tested against a generic profile
 * tells you nothing about whether it works.
 */

import { getMovieByTitle } from "../data/movies";
import type { Movie, Rating, RatingValue } from "../types";

export const DEMO_USER = {
  name: "Ajay",
} as const;

/** Titles must exist in the seeded cache; unresolved entries are dropped. */
const RATED: Array<[title: string, value: RatingValue]> = [
  ["The Social Network", 5],
  ["Whiplash", 5],
  ["Kiss Kiss Bang Bang", 5],
  ["Parasite", 5],
  ["Zodiac", 5],
  ["Game Night", 4],
  ["Moneyball", 4],
  ["Gone Girl", 4],
  ["Knives Out", 4],
  ["Nightcrawler", 4],
  ["Michael Clayton", 4],
  ["Se7en", 4],
  ["Uncut Gems", 4],
  ["Inception", 3],
  ["Blade Runner 2049", 3],
  ["Mad Max: Fury Road", 3],
  ["The Lighthouse", 2],
  ["Portrait of a Lady on Fire", 2],
];

/**
 * Watchlist entries with an age, in days since they were added.
 *
 * The ages are not decoration — the smart watchlist sorts on them, and the
 * decay prompt ("still want to watch this?") only means anything if some
 * entries have genuinely been sitting there for a year.
 */
const WATCHLIST_TITLES: Array<[title: string, ageInDays: number]> = [
  ["The Nice Guys", 6],
  ["Anatomy of a Fall", 14],
  ["Past Lives", 31],
  ["Aftersun", 58],
  ["Booksmart", 96],
  ["In the Mood for Love", 214],
  ["Oldboy", 288],
  ["The Banshees of Inisherin", 355],
  ["Prisoners", 421],
];

function resolve(title: string): Movie | null {
  return getMovieByTitle(title) ?? null;
}

export type RatedMovie = { movie: Movie; rating: Rating };

/** Every film the demo user has rated, newest first. */
export const ratedMovies: RatedMovie[] = RATED.flatMap(([title, value], index) => {
  const movie = resolve(title);
  if (!movie) return [];
  return [
    {
      movie,
      rating: {
        movieId: movie.tmdbId,
        value,
        // Spaced a few days apart so "recently rated" ordering is meaningful.
        ratedAt: new Date(Date.UTC(2026, 6, 1) - index * 3 * 86_400_000).toISOString(),
      },
    },
  ];
});

export type WatchlistEntry = {
  movie: Movie;
  addedAt: string;
  /** Days since it was added, precomputed so pages don't each redo the arithmetic. */
  ageInDays: number;
};

/**
 * Ages are measured from a fixed date rather than `Date.now()`.
 *
 * A clock-dependent value would differ between the server render and the
 * client hydration and produce a mismatch. Phase 3 replaces this with real
 * timestamps, where the arithmetic happens server-side against the database.
 */
const WATCHLIST_EPOCH = Date.UTC(2026, 7, 15);

export const watchlist: WatchlistEntry[] = WATCHLIST_TITLES.flatMap(
  ([title, ageInDays]) => {
    const movie = resolve(title);
    if (!movie) return [];
    return [
      {
        movie,
        ageInDays,
        addedAt: new Date(WATCHLIST_EPOCH - ageInDays * 86_400_000).toISOString(),
      },
    ];
  },
);

const RATED_IDS = new Set(ratedMovies.map((r) => r.movie.tmdbId));

export const isWatched = (tmdbId: number) => RATED_IDS.has(tmdbId);

export const ratingFor = (tmdbId: number): RatingValue | null =>
  ratedMovies.find((r) => r.movie.tmdbId === tmdbId)?.rating.value ?? null;

export const isOnWatchlist = (tmdbId: number) =>
  watchlist.some((entry) => entry.movie.tmdbId === tmdbId);
