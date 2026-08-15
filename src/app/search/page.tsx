import type { Metadata } from "next";
import Link from "next/link";

import { Measure } from "@/components/chrome/AppShell";
import { SearchField } from "@/components/search/SearchField";
import { Poster } from "@/components/ui/Poster";
import { getMovieById } from "@/lib/data/movies";
import { releaseYear } from "@/lib/format";
import { searchMovies, type SearchHit } from "@/lib/tmdb/client";

export const metadata: Metadata = {
  title: "Search · Reframe",
};

/**
 * Enough results to find what you meant, few enough that the page stays a
 * lookup rather than becoming another feed to browse.
 */
const RESULT_LIMIT = 18;

/**
 * TMDB returns a long tail of near-empty records — festival entries, duplicate
 * uploads, films with no artwork. They are technically matches and always
 * noise.
 */
function isWorthShowing(hit: SearchHit): boolean {
  return Boolean(hit.posterPath) && hit.voteCount >= 5;
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const raw = params.q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  // TMDB is a third party on the render path. When it is unreachable the page
  // should say so and stay usable, not surface a 500 — the rest of the app
  // runs off the local cache and is unaffected.
  let hits: SearchHit[] = [];
  let unreachable = false;

  if (query) {
    try {
      ({ hits } = await searchMovies(query));
    } catch {
      unreachable = true;
    }
  }

  // Popularity as the tiebreaker, because TMDB's relevance ranking puts exact
  // title matches on obscure records above the film everyone means.
  const results = hits
    .filter(isWorthShowing)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, RESULT_LIMIT);

  return (
    <Measure>
      <header className="pt-8 md:pt-12">
        <span className="eyebrow">Search</span>
        <h1 className="font-display text-ink mt-3 text-[2rem] sm:text-[2.5rem]">
          Find a film
        </h1>
      </header>

      <div className="mt-6">
        <SearchField initialQuery={query} />
      </div>

      {unreachable && (
        <p className="text-accent mt-4 text-sm">
          Couldn&rsquo;t reach TMDB just now. Try that again in a moment — everything
          else still works from the local cache.
        </p>
      )}

      {query && !unreachable && (
        <p className="text-muted mt-4 text-sm">
          {results.length === 0
            ? `Nothing for “${query}”.`
            : `${results.length} result${results.length === 1 ? "" : "s"} for “${query}”`}
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-8 grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-6">
          {results.map((hit) => (
            <li key={hit.tmdbId}>
              <Link href={`/movie/${hit.tmdbId}`} className="group block">
                <div className="transition-transform duration-300 group-hover:-translate-y-1">
                  <Poster
                    path={hit.posterPath}
                    title={hit.title}
                    // Seeded films already have a palette; anything else gets
                    // one derived server-side when its detail page opens.
                    palette={getMovieById(hit.tmdbId)?.palette}
                    sizes="(min-width: 768px) 160px, 30vw"
                  />
                </div>
                <h2 className="text-ink mt-2.5 truncate text-sm font-medium">
                  {hit.title}
                </h2>
                <p className="meta mt-0.5">{releaseYear(hit.releaseDate) ?? "—"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!query && (
        <p className="text-muted mt-8 max-w-md text-sm leading-relaxed">
          Search runs against all of TMDB, not just the films cached locally. Anything
          you open gets a palette and a predicted fit the same way a seeded film does.
        </p>
      )}
    </Measure>
  );
}

