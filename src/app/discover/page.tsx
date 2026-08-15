import type { Metadata } from "next";
import Link from "next/link";

import { Measure } from "@/components/chrome/AppShell";
import { MovieCard } from "@/components/movie/MovieCard";
import { Section, SectionHeading } from "@/components/ui/Section";
import { allMovies, toSummary } from "@/lib/data/movies";
import { ratedMovies, watchlist } from "@/lib/mock/session";
import { buildProfile, scoreMovie } from "@/lib/recommend/profile";
import { rankAll, toFit } from "@/lib/recommend/recommend";
import type { Movie } from "@/lib/types";

export const metadata: Metadata = {
  title: "Discover · Reframe",
  description: "Edited shelves, not an infinite feed.",
};

/** Films per rail. Short enough that a rail ends rather than trailing off. */
const RAIL_SIZE = 8;

/** Below this vote count TMDB's audience score stops being meaningful — which is what makes something a hidden gem. */
const GEM_VOTE_CEILING = 4000;

export default function DiscoverPage() {
  const catalogue = allMovies();
  const profile = buildProfile(ratedMovies, catalogue);
  const ranked = rankAll().filter((entry) => !profile.ratedIds.has(entry.movie.tmdbId));

  // "Because you loved X" — anchored on the user's single highest-rated film,
  // scored against that film rather than against the whole profile, so the
  // rail genuinely answers the heading it sits under.
  const anchor = [...ratedMovies].sort((a, b) => b.rating.value - a.rating.value)[0];
  const anchorProfile = anchor ? buildProfile([anchor], catalogue) : null;
  const becauseYouLoved = anchorProfile
    ? catalogue
        .filter((movie) => !profile.ratedIds.has(movie.tmdbId))
        .map((movie) => scoreMovie(movie, anchorProfile))
        .sort((a, b) => b.score - a.score)
        .slice(0, RAIL_SIZE)
    : [];

  const probablyLove = ranked.slice(0, RAIL_SIZE);

  const hiddenGems = ranked
    .filter((entry) => entry.movie.voteCount < GEM_VOTE_CEILING)
    .slice(0, RAIL_SIZE);

  // The wild cards rail deliberately reaches down the ranking rather than up.
  const wildCards = ranked.slice(-RAIL_SIZE).reverse();

  const watchlistRanked = watchlist
    .map((entry) => scoreMovie(entry.movie, profile))
    .sort((a, b) => b.score - a.score);

  return (
    <Measure>
      <header className="pt-8 md:pt-12">
        <div className="flex items-baseline justify-between gap-4">
          <span className="eyebrow">Discover</span>
          {/* The mobile nav has no room for a sixth destination, so search
              lives here — the one screen where looking for something specific
              is the obvious next thought. */}
          <Link
            href="/search"
            className="text-muted hover:text-ink text-xs transition-colors duration-200 md:hidden"
          >
            Search
          </Link>
        </div>
        <h1 className="font-display text-ink mt-3 text-[2rem] text-balance sm:text-[2.5rem]">
          Shelves, not a feed.
        </h1>
        <p className="text-muted mt-3 max-w-md text-sm leading-relaxed">
          Everything here is ordered by how well we think it fits you — not by what
          came out most recently.
        </p>
      </header>

      {anchor && becauseYouLoved.length > 0 && (
        <Rail
          eyebrow="Because you loved"
          title={anchor.movie.title}
          entries={becauseYouLoved}
        />
      )}

      <Rail eyebrow="You'd probably love this" entries={probablyLove} />

      {hiddenGems.length > 0 && (
        <Rail
          eyebrow="Hidden gems"
          title="Fewer people have found these"
          entries={hiddenGems}
        />
      )}

      {watchlistRanked.length > 0 && (
        <Rail
          eyebrow="Your watchlist"
          title="Watch this next"
          entries={watchlistRanked.slice(0, RAIL_SIZE)}
          action={{ label: "All of it", href: "/profile" }}
        />
      )}

      {wildCards.length > 0 && (
        <Rail eyebrow="Wild cards" title="Nothing like your usual" entries={wildCards} />
      )}
    </Measure>
  );
}

function Rail({
  eyebrow,
  title,
  entries,
  action,
}: {
  eyebrow: string;
  title?: string;
  entries: Array<{ movie: Movie; score: number }>;
  action?: { label: string; href: string };
}) {
  if (entries.length === 0) return null;

  return (
    <Section>
      <SectionHeading eyebrow={eyebrow} title={title} action={action} />
      <ul className="rail">
        {entries.map((entry) => (
          <li key={entry.movie.tmdbId}>
            <MovieCard movie={toSummary(entry.movie)} fit={toFit(entry.score)} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
