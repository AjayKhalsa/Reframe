/**
 * Domain types for Reframe.
 *
 * `Movie` mirrors the `movies` table in the product plan — it is deliberately a
 * narrow projection of TMDB, not a mirror of it. We store only what the
 * recommendation engine and the UI need, and we keep TMDB's image *paths*
 * rather than the images themselves.
 */

export type Person = {
  id: number;
  name: string;
  /** TMDB profile path, may be absent for lesser-known people. */
  profilePath: string | null;
};

export type CastMember = Person & {
  character: string;
  order: number;
};

/** A colour palette derived from a film's artwork. See `src/lib/palette`. */
export type Palette = {
  background: string;
  surface: string;
  accent: string;
  muted: string;
  text: string;
};

export type Movie = {
  tmdbId: number;
  title: string;
  /** Original title, shown only when it differs from `title`. */
  originalTitle: string | null;
  tagline: string | null;
  releaseDate: string | null;
  /** Minutes. Null when TMDB has no runtime on record. */
  runtime: number | null;
  genres: string[];
  overview: string;
  keywords: string[];
  director: string | null;
  cast: CastMember[];
  posterPath: string | null;
  backdropPath: string | null;
  originalLanguage: string;
  /** TMDB community rating, 0–10. Used as a weak prior, never as the ranking. */
  voteAverage: number;
  voteCount: number;
  /**
   * Palette baked at seed time from the poster, so the first paint is already
   * in the film's colours instead of flashing neutral then re-theming.
   */
  palette: Palette | null;
  /** V2. Absent until the embedding pipeline runs. */
  embedding?: number[];
};

/** A movie stripped to what a card or grid tile needs. */
export type MovieSummary = Pick<
  Movie,
  | "tmdbId"
  | "title"
  | "releaseDate"
  | "runtime"
  | "genres"
  | "posterPath"
  | "backdropPath"
  | "palette"
>;

export type RatingValue = 1 | 2 | 3 | 4 | 5;

export type Rating = {
  movieId: number;
  value: RatingValue;
  ratedAt: string;
};
