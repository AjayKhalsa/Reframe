import type { Metadata } from "next";

import { Measure } from "@/components/chrome/AppShell";
import { MovieCard } from "@/components/movie/MovieCard";
import { Section, SectionHeading } from "@/components/ui/Section";
import { toSummary } from "@/lib/data/movies";
import { formatRuntime } from "@/lib/format";
import { ratedMovies } from "@/lib/mock/session";
import { summariseTaste } from "@/lib/recommend/summary";

export const metadata: Metadata = {
  title: "Your taste · Reframe",
  description: "What we think we've learned about you.",
};

export default function TastePage() {
  const taste = summariseTaste();

  const loved = ratedMovies
    .filter((entry) => entry.rating.value === 5)
    .map((entry) => entry.movie);

  const disliked = ratedMovies
    .filter((entry) => entry.rating.value <= 2)
    .map((entry) => entry.movie);

  return (
    <Measure>
      <header className="pt-8 md:pt-12">
        <span className="eyebrow">Your taste</span>

        {/* The headline is the whole point of this screen: one sentence a
            person could repeat about themselves. Everything below is evidence
            for it. */}
        <p className="font-display text-ink mt-4 max-w-2xl text-[1.75rem] leading-[1.25] text-balance sm:text-[2.25rem]">
          {taste.headline}
        </p>

        <dl className="mt-8 flex gap-8">
          <Stat label="Rated" value={taste.counts.rated} />
          <Stat label="Loved" value={taste.counts.loved} />
          <Stat label="Watchlist" value={taste.counts.watchlist} />
        </dl>
      </header>

      {taste.genres.length > 0 && (
        <Section>
          <SectionHeading eyebrow="You gravitate toward" />
          <TagList items={taste.genres} emphasis />
        </Section>
      )}

      {taste.themes.length > 0 && (
        <Section>
          <SectionHeading eyebrow="You seem to love" />
          <TagList items={taste.themes} />
        </Section>
      )}

      {taste.directors.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Directors" />
          <TagList items={taste.directors} emphasis />
        </Section>
      )}

      <Section>
        <SectionHeading eyebrow="Your sweet spot" />
        <div className="flex flex-wrap items-baseline gap-x-10 gap-y-6">
          {taste.runtimeSweetSpot ? (
            <p className="font-display text-ink text-[1.75rem]">
              {formatRuntime(taste.runtimeSweetSpot.low)}
              <span className="text-muted mx-2 text-lg">–</span>
              {formatRuntime(taste.runtimeSweetSpot.high)}
            </p>
          ) : (
            <p className="text-muted text-sm">
              Not enough ratings yet to find a pattern in length.
            </p>
          )}

          {taste.eras.length > 0 && (
            <p className="font-display text-ink text-[1.75rem]">
              {taste.eras.join(", ")}
            </p>
          )}
        </div>
      </Section>

      {loved.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Five stars" title="The films this is all built on" />
          <ul className="rail">
            {loved.map((movie) => (
              <li key={movie.tmdbId}>
                <MovieCard movie={toSummary(movie)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {disliked.length > 0 && (
        <Section>
          <SectionHeading
            eyebrow="Not for you"
            title="Just as useful to know"
          />
          <ul className="rail">
            {disliked.map((movie) => (
              <li key={movie.tmdbId}>
                <MovieCard movie={toSummary(movie)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Measure>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="font-display text-ink mt-1 text-[1.75rem] tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Ranked labels rendered as a list, deliberately without percentages.
 *
 * Order carries the weighting — the first item matters most — which is as much
 * precision as a few dozen ratings can honestly support.
 */
function TagList({ items, emphasis = false }: { items: string[]; emphasis?: boolean }) {
  return (
    <ul className={emphasis ? "flex flex-wrap gap-x-7 gap-y-2" : "flex flex-wrap gap-x-5 gap-y-2"}>
      {items.map((item) => (
        <li
          key={item}
          className={
            emphasis
              ? "font-display text-ink text-[1.5rem] capitalize"
              : "text-ink/85 text-[1.0625rem] capitalize"
          }
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

