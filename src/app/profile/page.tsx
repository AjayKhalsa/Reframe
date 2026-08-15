import type { Metadata } from "next";
import Link from "next/link";

import { Measure } from "@/components/chrome/AppShell";
import { STALE_AFTER_DAYS, WatchlistRow } from "@/components/watchlist/WatchlistRow";
import { Section, SectionHeading } from "@/components/ui/Section";
import { allMovies } from "@/lib/data/movies";
import { DEMO_USER, ratedMovies, watchlist } from "@/lib/mock/session";
import { buildProfile, scoreMovie } from "@/lib/recommend/profile";
import { toFit } from "@/lib/recommend/recommend";

export const metadata: Metadata = {
  title: "Profile · Reframe",
};

/**
 * Profile, which in practice means the smart watchlist.
 *
 * A watchlist that is only a list is a list nobody finishes. Ranking it into
 * "watch this next", "putting this off" and "your taste has changed" turns a
 * backlog back into a set of decisions — which is the same job the home screen
 * does, applied to films the user already chose once.
 */
export default function ProfilePage() {
  const profile = buildProfile(ratedMovies, allMovies());

  const scored = watchlist
    .map((entry) => ({ ...entry, ...scoreMovie(entry.movie, profile) }))
    .sort((a, b) => b.score - a.score);

  const fresh = scored.filter((entry) => entry.ageInDays < STALE_AFTER_DAYS);
  const stale = scored.filter((entry) => entry.ageInDays >= STALE_AFTER_DAYS);

  const next = fresh.slice(0, 3);
  const nextIds = new Set(next.map((entry) => entry.movie.tmdbId));
  const rest = fresh.filter((entry) => !nextIds.has(entry.movie.tmdbId));

  return (
    <Measure>
      <header className="pt-8 md:pt-12">
        <span className="eyebrow">Profile</span>
        <h1 className="font-display text-ink mt-3 text-[2rem] sm:text-[2.5rem]">
          {DEMO_USER.name}
        </h1>
        <p className="text-muted mt-3 text-sm">
          {ratedMovies.length} rated · {watchlist.length} on the watchlist ·{" "}
          <Link href="/taste" className="text-ink hover:text-accent transition-colors">
            see your taste
          </Link>
        </p>
      </header>

      {next.length > 0 && (
        <Section>
          <SectionHeading
            eyebrow="Watch this next"
            title="Highest predicted enjoyment"
          />
          {next.map((entry) => (
            <WatchlistRow
              key={entry.movie.tmdbId}
              movie={entry.movie}
              fit={toFit(entry.score)}
              ageInDays={entry.ageInDays}
            />
          ))}
        </Section>
      )}

      {rest.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Also waiting" />
          {rest.map((entry) => (
            <WatchlistRow
              key={entry.movie.tmdbId}
              movie={entry.movie}
              fit={toFit(entry.score)}
              ageInDays={entry.ageInDays}
            />
          ))}
        </Section>
      )}

      {stale.length > 0 && (
        <Section>
          <SectionHeading
            eyebrow="You've been putting this off"
            title="Worth deciding about"
          />
          <p className="text-muted -mt-1 mb-2 max-w-md text-sm leading-relaxed">
            These have been sitting there a while. Clearing the ones you&rsquo;ve gone
            off keeps the rest of the list worth reading.
          </p>
          {stale.map((entry) => (
            <WatchlistRow
              key={entry.movie.tmdbId}
              movie={entry.movie}
              fit={toFit(entry.score)}
              ageInDays={entry.ageInDays}
            />
          ))}
        </Section>
      )}

      <Section>
        <SectionHeading eyebrow="Account" />
        <p className="text-muted max-w-md text-sm leading-relaxed">
          Sign-in, the Letterboxd import and syncing arrive with Phases 3 and 5. Right
          now this is a single local profile with no account attached.
        </p>
      </Section>
    </Measure>
  );
}

