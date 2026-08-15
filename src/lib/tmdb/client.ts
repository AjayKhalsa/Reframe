/**
 * Minimal TMDB v3 client.
 *
 * Auth prefers the v4 read token (a bearer JWT); the v3 key is kept as a
 * fallback because TMDB accounts issue both and users often have only one.
 * Nothing here is exported to the browser — callers are server components,
 * route handlers, and the seed script.
 */

import type { CastMember, Movie } from "../types";

const BASE = "https://api.themoviedb.org/3";

/** How long Next may reuse a TMDB response. Film metadata is near-static. */
const REVALIDATE_SECONDS = 60 * 60 * 24;

export class TmdbError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(`TMDB ${status} on ${path}: ${message}`);
    this.name = "TmdbError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dispatcher used when a request has already failed at the network level.
 *
 * Node's global `fetch` keeps a per-origin connection pool. When TMDB resets a
 * pooled socket, plain retries go straight back to the same poisoned pool and
 * fail identically — observed here as five consecutive ECONNRESETs in a
 * long-running server while a fresh process reached the same endpoint fine.
 *
 * A throwaway agent per retry forces a new connection. It is deliberately not
 * used for first attempts: pooling is worth having, and this only exists to
 * break out of a pool that has gone bad.
 */
async function fetchOnFreshConnection(url: string, headers: Record<string, string>) {
  const { Agent } = await import("undici");
  const agent = new Agent({ pipelining: 0, connections: 1 });
  try {
    return await fetch(url, {
      headers,
      cache: "no-store",
      // Not part of the DOM fetch types, but Node's implementation honours it.
      dispatcher: agent,
    } as RequestInit);
  } finally {
    await agent.close().catch(() => {});
  }
}

function auth(): { headers: Record<string, string>; keyParam: string | null } {
  const token = process.env.TMDB_READ_TOKEN;
  if (token) {
    return { headers: { Authorization: `Bearer ${token}` }, keyParam: null };
  }
  const key = process.env.TMDB_API_KEY;
  if (key) return { headers: {}, keyParam: key };

  throw new Error(
    "No TMDB credentials. Set TMDB_READ_TOKEN (preferred) or TMDB_API_KEY in .env.local — see .env.example.",
  );
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { headers, keyParam } = auth();
  const search = new URLSearchParams(params);
  if (keyParam) search.set("api_key", keyParam);

  const url = `${BASE}${path}?${search}`;

  // Retries exist for the seed script more than for the app: forty near-
  // simultaneous requests reliably produce a few dropped connections, and
  // losing a film from the cache over one flaky socket is not acceptable.
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(300 * 2 ** attempt);

    const requestHeaders = { ...headers, accept: "application/json" };

    try {
      const res =
        attempt === 0
          ? await fetch(url, {
              headers: requestHeaders,
              // `next` is ignored outside the Next runtime, which is what the seed script wants.
              next: { revalidate: REVALIDATE_SECONDS },
            })
          : await fetchOnFreshConnection(url, requestHeaders);

      // 4xx other than rate-limiting means the request itself is wrong; retrying
      // just burns quota against the same wrong answer.
      if (res.status === 429 || res.status >= 500) {
        lastError = new TmdbError(res.status, path, res.statusText);
        continue;
      }
      if (!res.ok) {
        throw new TmdbError(res.status, path, await res.text().catch(() => res.statusText));
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof TmdbError) throw error;
      lastError = error; // network-level failure — worth another go
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`TMDB request to ${path} failed after 5 attempts`);
}

/* ------------------------------------------------------------------ *
 * Raw TMDB shapes — only the fields we actually read.
 * ------------------------------------------------------------------ */

type RawCredits = {
  cast: Array<{
    id: number;
    name: string;
    character: string;
    order: number;
    profile_path: string | null;
  }>;
  crew: Array<{ id: number; name: string; job: string; profile_path: string | null }>;
};

type RawMovie = {
  id: number;
  title: string;
  original_title: string;
  tagline: string | null;
  release_date: string | null;
  runtime: number | null;
  genres: Array<{ id: number; name: string }>;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  original_language: string;
  vote_average: number;
  vote_count: number;
  credits?: RawCredits;
  keywords?: { keywords: Array<{ id: number; name: string }> };
};

type RawSearchResult = {
  page: number;
  total_pages: number;
  total_results: number;
  results: Array<{
    id: number;
    title: string;
    release_date: string | null;
    poster_path: string | null;
    backdrop_path: string | null;
    genre_ids: number[];
    overview: string;
    vote_average: number;
    vote_count: number;
    popularity: number;
  }>;
};

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

/** How many cast members we keep. Beyond this the tail is noise for both the UI and the taste model. */
const CAST_LIMIT = 12;

export function toMovie(raw: RawMovie): Movie {
  const crew = raw.credits?.crew ?? [];
  // TMDB lists co-directors as multiple "Director" rows; the first is the billed one.
  const director = crew.find((c) => c.job === "Director")?.name ?? null;

  const cast: CastMember[] = (raw.credits?.cast ?? [])
    .slice(0, CAST_LIMIT)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      order: c.order,
      profilePath: c.profile_path,
    }));

  return {
    tmdbId: raw.id,
    title: raw.title,
    originalTitle: raw.original_title !== raw.title ? raw.original_title : null,
    tagline: raw.tagline || null,
    releaseDate: raw.release_date || null,
    runtime: raw.runtime ?? null,
    genres: raw.genres.map((g) => g.name),
    overview: raw.overview,
    keywords: (raw.keywords?.keywords ?? []).map((k) => k.name),
    director,
    cast,
    posterPath: raw.poster_path,
    backdropPath: raw.backdrop_path,
    originalLanguage: raw.original_language,
    voteAverage: raw.vote_average,
    voteCount: raw.vote_count,
    palette: null,
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Full record for one film, including the credits and keywords the taste model needs. */
export async function getMovie(tmdbId: number): Promise<Movie> {
  const raw = await get<RawMovie>(`/movie/${tmdbId}`, {
    append_to_response: "credits,keywords",
  });
  return toMovie(raw);
}

export type SearchHit = {
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  voteAverage: number;
  voteCount: number;
  popularity: number;
};

export async function searchMovies(
  query: string,
  { page = 1, includeAdult = false } = {},
): Promise<{ hits: SearchHit[]; totalPages: number; totalResults: number }> {
  const trimmed = query.trim();
  if (!trimmed) return { hits: [], totalPages: 0, totalResults: 0 };

  const raw = await get<RawSearchResult>("/search/movie", {
    query: trimmed,
    page: String(page),
    include_adult: String(includeAdult),
  });

  return {
    totalPages: raw.total_pages,
    totalResults: raw.total_results,
    hits: raw.results.map((r) => ({
      tmdbId: r.id,
      title: r.title,
      releaseDate: r.release_date || null,
      posterPath: r.poster_path,
      backdropPath: r.backdrop_path,
      overview: r.overview,
      voteAverage: r.vote_average,
      voteCount: r.vote_count,
      popularity: r.popularity,
    })),
  };
}

/**
 * Stratified discovery, for building the catalogue.
 *
 * Ordered by vote count rather than popularity: popularity is a rolling
 * measure of what is trending this week, which would make the catalogue a
 * snapshot of the moment rather than of cinema.
 */
export async function searchDiscover({
  page = 1,
  minVotes = 150,
  releasedFrom,
  releasedTo,
  language,
}: {
  page?: number;
  minVotes?: number;
  releasedFrom?: string;
  releasedTo?: string;
  /** ISO 639-1 original language, e.g. "ja". */
  language?: string;
}): Promise<SearchHit[]> {
  const params: Record<string, string> = {
    page: String(page),
    include_adult: "false",
    sort_by: "vote_count.desc",
    "vote_count.gte": String(minVotes),
  };
  if (releasedFrom) params["primary_release_date.gte"] = releasedFrom;
  if (releasedTo) params["primary_release_date.lte"] = releasedTo;
  if (language) params.with_original_language = language;

  const raw = await get<RawSearchResult>("/discover/movie", params);
  return raw.results.map((r) => ({
    tmdbId: r.id,
    title: r.title,
    releaseDate: r.release_date || null,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    overview: r.overview,
    voteAverage: r.vote_average,
    voteCount: r.vote_count,
    popularity: r.popularity,
  }));
}

/** Films TMDB considers similar. A cheap candidate source before our own engine exists. */
export async function getRecommendations(tmdbId: number): Promise<SearchHit[]> {
  const raw = await get<RawSearchResult>(`/movie/${tmdbId}/recommendations`);
  return raw.results.map((r) => ({
    tmdbId: r.id,
    title: r.title,
    releaseDate: r.release_date || null,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    overview: r.overview,
    voteAverage: r.vote_average,
    voteCount: r.vote_count,
    popularity: r.popularity,
  }));
}
