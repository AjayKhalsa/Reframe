/**
 * Content-based taste profile — the V1 engine from the roadmap.
 *
 * A film is reduced to a bag of weighted features (genres, keywords, director,
 * cast, era, runtime band). A user is the weighted sum of the films they rated,
 * with high ratings pulling features up and low ratings pushing them down.
 * Scoring a candidate is then a dot product between the two.
 *
 * No embeddings and no collaborative filtering yet — those are V2 and V4. What
 * this does give us is a real signal derived from real ratings, so nothing on
 * screen is a fabricated number.
 */

import type { Movie, RatingValue } from "../types";
import type { RatedMovie } from "../mock/session";

export type FeatureVector = Map<string, number>;

/**
 * How much each star rating moves the profile.
 *
 * Not linear, and not symmetric. Five stars is a much stronger statement than
 * four, three is close to no information at all, and a one-star rating is the
 * clearest signal a user ever gives — people rarely bother hating something
 * they are indifferent to.
 */
const RATING_WEIGHT: Record<RatingValue, number> = {
  5: 2.0,
  4: 0.9,
  3: 0.05,
  2: -1.1,
  1: -2.2,
};

/**
 * Relative influence of each feature family.
 *
 * Keywords carry the most because they encode what a film is *about*
 * ("obsession", "heist", "coming of age") where genre only encodes what shelf
 * it sits on. Cast is weakest: enjoying one film an actor is in says far less
 * than the plan's intuition suggests.
 */
const FAMILY_WEIGHT = {
  genre: 1.0,
  keyword: 1.35,
  director: 1.5,
  cast: 0.4,
  era: 0.5,
  runtime: 0.35,
} as const;

/** Keywords appearing on this share of films or more are too generic to inform anything. */
const KEYWORD_UBIQUITY_CEILING = 0.25;

/**
 * TMDB keywords that describe the artefact rather than the film.
 *
 * Production and provenance tags say nothing about whether someone will enjoy
 * a film — two people who both like "based on novel or book" have nothing in
 * common — and they read terribly in generated copy.
 */
const META_KEYWORDS = new Set([
  "duringcreditsstinger",
  "aftercreditsstinger",
  "based on novel or book",
  "based on true story",
  "based on comic",
  "woman director",
  "independent film",
  "sequel",
  "prequel",
  "remake",
  "imax",
  "3d",
  "live action remake",
]);

/**
 * Setting keywords: places and periods.
 *
 * TMDB tags films heavily by location ("los angeles, california", "new york
 * city") and by decade ("1970s"). Shared geography is a coincidence, not a
 * taste — without this filter the engine happily concludes that someone likes
 * "los angeles" and says so out loud.
 */
function isSettingKeyword(keyword: string): boolean {
  // Place names are almost always comma-qualified in TMDB's vocabulary.
  if (keyword.includes(",")) return true;
  if (/^(19|20)\d0s$/.test(keyword)) return true;
  if (/\b(city|island|county|province|state)$/.test(keyword)) return true;
  return false;
}

export function isUsefulKeyword(keyword: string): boolean {
  const normalised = keyword.toLowerCase().trim();
  if (normalised.length < 3) return false;
  if (META_KEYWORDS.has(normalised)) return false;
  return !isSettingKeyword(normalised);
}

/** Only the top-billed cast carry signal; the rest is noise. */
const CAST_DEPTH = 5;

function eraOf(releaseDate: string | null): string | null {
  const year = Number.parseInt(releaseDate?.slice(0, 4) ?? "", 10);
  if (!Number.isFinite(year)) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

function runtimeBandOf(runtime: number | null): string | null {
  if (!runtime) return null;
  if (runtime < 90) return "short";
  if (runtime <= 135) return "standard";
  return "long";
}

/**
 * Features of a single film, before any user weighting.
 *
 * `stopKeywords` are the over-common terms computed across the whole catalogue;
 * passing them in keeps this function pure and testable.
 */
export function featuresOf(movie: Movie, stopKeywords: Set<string> = new Set()): FeatureVector {
  const features: FeatureVector = new Map();
  const add = (key: string, weight: number) =>
    features.set(key, (features.get(key) ?? 0) + weight);

  for (const genre of movie.genres) add(`genre:${genre}`, FAMILY_WEIGHT.genre);

  for (const keyword of movie.keywords) {
    if (stopKeywords.has(keyword) || !isUsefulKeyword(keyword)) continue;
    add(`keyword:${keyword}`, FAMILY_WEIGHT.keyword);
  }

  if (movie.director) add(`director:${movie.director}`, FAMILY_WEIGHT.director);

  for (const member of movie.cast.slice(0, CAST_DEPTH)) {
    add(`cast:${member.id}`, FAMILY_WEIGHT.cast);
  }

  const era = eraOf(movie.releaseDate);
  if (era) add(`era:${era}`, FAMILY_WEIGHT.era);

  const band = runtimeBandOf(movie.runtime);
  if (band) add(`runtime:${band}`, FAMILY_WEIGHT.runtime);

  return features;
}

/** Keywords so common across the catalogue that they separate nothing. */
export function findStopKeywords(catalogue: Movie[]): Set<string> {
  const counts = new Map<string, number>();
  for (const movie of catalogue) {
    for (const keyword of new Set(movie.keywords)) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }

  const ceiling = catalogue.length * KEYWORD_UBIQUITY_CEILING;
  return new Set(
    [...counts.entries()].filter(([, count]) => count > ceiling).map(([keyword]) => keyword),
  );
}

export type TasteProfile = {
  features: FeatureVector;
  /** L2 norm, cached for cosine scoring. */
  magnitude: number;
  stopKeywords: Set<string>;
  ratedIds: Set<number>;
};

export function buildProfile(rated: RatedMovie[], catalogue: Movie[]): TasteProfile {
  const stopKeywords = findStopKeywords(catalogue);
  const features: FeatureVector = new Map();

  for (const { movie, rating } of rated) {
    const weight = RATING_WEIGHT[rating.value];
    if (weight === 0) continue;

    // Normalise per film so a keyword-rich record does not simply outvote a
    // sparse one — we want the user's opinion weighted, not TMDB's metadata
    // completeness.
    const movieFeatures = featuresOf(movie, stopKeywords);
    const norm = Math.sqrt([...movieFeatures.values()].reduce((s, v) => s + v * v, 0)) || 1;

    for (const [key, value] of movieFeatures) {
      features.set(key, (features.get(key) ?? 0) + (value / norm) * weight);
    }
  }

  const magnitude =
    Math.sqrt([...features.values()].reduce((sum, v) => sum + v * v, 0)) || 1;

  return {
    features,
    magnitude,
    stopKeywords,
    ratedIds: new Set(rated.map((r) => r.movie.tmdbId)),
  };
}

export type Scored = {
  movie: Movie;
  /** Cosine similarity against the profile, roughly -1..1 in practice. */
  score: number;
  /** Features that contributed most, strongest first. */
  contributors: Array<{ key: string; contribution: number }>;
};

export function scoreMovie(movie: Movie, profile: TasteProfile): Scored {
  const features = featuresOf(movie, profile.stopKeywords);
  const norm = Math.sqrt([...features.values()].reduce((s, v) => s + v * v, 0)) || 1;

  let score = 0;
  const contributors: Array<{ key: string; contribution: number }> = [];

  for (const [key, value] of features) {
    const profileWeight = profile.features.get(key);
    if (!profileWeight) continue;
    const contribution = (value / norm) * (profileWeight / profile.magnitude);
    score += contribution;
    contributors.push({ key, contribution });
  }

  contributors.sort((a, b) => b.contribution - a.contribution);
  return { movie, score, contributors };
}

/**
 * Maps a cosine score onto the 0–100 "fit" the interface shows.
 *
 * This is a presentation scale, not a probability — cosine similarities in a
 * catalogue this size cluster in a narrow band, and showing "0.11 fit" would be
 * both accurate and useless. The curve is monotone, so the ordering the user
 * sees is exactly the ordering the engine produced.
 */
export function toFit(score: number): number {
  const squashed = 1 / (1 + Math.exp(-14 * (score - 0.12)));
  return Math.round(45 + squashed * 52);
}

/** Turns a feature key into something worth showing a human. */
export function describeFeature(key: string): string | null {
  const [family, ...rest] = key.split(":");
  const value = rest.join(":");
  switch (family) {
    case "genre":
      return value.toLowerCase();
    case "keyword":
      return value.toLowerCase();
    case "director":
      return value;
    case "era":
      return `${value} cinema`;
    default:
      // Cast ids and runtime bands mean nothing to a reader.
      return null;
  }
}
