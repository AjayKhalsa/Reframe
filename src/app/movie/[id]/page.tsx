import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { FilmBackdrop } from "@/components/cinema/FilmBackdrop";
import { MovieActions } from "@/components/movie/MovieActions";
import { MovieCard } from "@/components/movie/MovieCard";
import { NearbyFilms } from "@/components/universe/NearbyFilms";
import { ReturnControls } from "@/components/universe/ReturnControls";
import { RootSurface } from "@/components/surface/RootSurface";
import { Surface } from "@/components/surface/Surface";
import { FilmTheme } from "@/components/theme/FilmTheme";
import { Poster } from "@/components/ui/Poster";
import { Section, SectionHeading } from "@/components/ui/Section";
import { toSummary } from "@/lib/data/movies";
import { resolveMovie } from "@/lib/data/resolve";
import { formatRuntime, releaseYear } from "@/lib/format";
import { isOnWatchlist, ratingFor } from "@/lib/mock/session";
import { rankAll, toFit } from "@/lib/recommend/recommend";
import { profileUrl } from "@/lib/tmdb/images";

export async function generateMetadata({ params }: PageProps<"/movie/[id]">): Promise<Metadata> {
  const { id } = await params;
  const movie = await resolveMovie(Number(id));
  if (!movie) return { title: "Not found · Reframe" };
  return {
    title: `${movie.title} · Reframe`,
    description: movie.overview.slice(0, 160),
  };
}

/** How many similar films to show. Enough for one rail, not enough to browse. */
const SIMILAR_COUNT = 8;

export default async function MoviePage({ params }: PageProps<"/movie/[id]">) {
  const { id } = await params;
  const movie = await resolveMovie(Number(id));
  if (!movie) notFound();

  // Taste ranking still orders the genre rail below, but no score is shown.
  const ranked = rankAll();

  // "Similar" by shared genre, ordered by predicted fit — so the rail is both
  // relevant to the film and relevant to the person reading it.
  const genres = new Set(movie.genres);
  const similar = ranked
    .filter(
      (entry) =>
        entry.movie.tmdbId !== movie.tmdbId &&
        entry.movie.genres.some((genre) => genres.has(genre)),
    )
    .slice(0, SIMILAR_COUNT);

  const year = releaseYear(movie.releaseDate);
  const runtime = formatRuntime(movie.runtime);

  return (
    // A film's own page is entirely a plate — the one place in the product
    // where the artwork gets the whole surface rather than a section of it.
    <Surface kind="plate" className="app-frame min-h-dvh pb-20">
      <RootSurface kind="plate" />
      <FilmTheme palette={movie.palette} />

      {/* Same treatment as the options plate, so opening a film out of the
          shortlist continues the same screen rather than arriving somewhere new. */}
      <FilmBackdrop
        tmdbId={movie.tmdbId}
        backdropPath={movie.backdropPath}
        posterPath={movie.posterPath}
        palette={movie.palette}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <div className="pt-6">
          <ReturnControls tmdbId={movie.tmdbId} />
        </div>


      <article className="rise flex flex-col gap-8 pt-10 md:flex-row md:gap-12 md:pt-16">
        {/* Slightly smaller than before. With the backdrop pulled back to
            atmosphere, the poster no longer has to shout over it — and at
            18rem the poster, the title and the background were all competing
            for the same rank. */}
        <div className="mx-auto w-[11rem] shrink-0 sm:w-[13rem] md:mx-0 md:w-[15rem]">
          <Poster
            path={movie.posterPath}
            title={movie.title}
            palette={movie.palette}
            priority
            sizes="(min-width: 768px) 288px, 224px"
          />
        </div>

        <div className="min-w-0 flex-1">
          {movie.originalTitle && (
            <p className="eyebrow mb-3">{movie.originalTitle}</p>
          )}

          <h1 className="font-display text-ink text-[2.5rem] text-balance sm:text-[3.25rem]">
            {movie.title}
          </h1>

          {movie.tagline && (
            <p className="text-muted mt-3 text-[0.9375rem] italic">{movie.tagline}</p>
          )}

          <p className="meta mt-4">
            {[year, movie.genres.join(", "), runtime].filter(Boolean).join(" · ")}
          </p>

          {/* No percentage. A number here turns the page into an algorithm
              readout, and how related this film is to anything is already
              expressed by where it sits in the universe and by the
              neighbourhood below. */}

          <p className="text-ink/85 mt-6 max-w-prose leading-relaxed text-pretty">
            {movie.overview}
          </p>

          {movie.director && (
            <p className="meta mt-5">
              Directed by <span className="text-ink">{movie.director}</span>
            </p>
          )}

          <div className="mt-8">
            <MovieActions
              initialOnWatchlist={isOnWatchlist(movie.tmdbId)}
              initialRating={ratingFor(movie.tmdbId)}
            />
          </div>
        </div>
      </article>

      {movie.cast.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Cast" />
          <ul className="rail">
            {movie.cast.map((member) => (
              <li key={member.id} className="w-[5.5rem]">
                <div
                  className="bg-surface overflow-hidden"
                  style={{ aspectRatio: "1 / 1", borderRadius: "999px" }}
                >
                  {profileUrl(member.profilePath, "w185") ? (
                    <img
                      src={profileUrl(member.profilePath, "w185") as string}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-muted grid h-full w-full place-items-center text-lg">
                      {member.name.charAt(0)}
                    </div>
                  )}
                </div>
                <p className="text-ink mt-2 text-xs leading-tight">{member.name}</p>
                <p className="text-muted mt-0.5 text-[0.6875rem] leading-tight">
                  {member.character}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* The neighbourhood from the embedding space comes first — it is the
          real answer to "what is like this". The genre-based rail below is a
          fallback for films that were never mapped. */}
      <NearbyFilms tmdbId={movie.tmdbId} />

      {similar.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Also worth a look" title="Sharing a genre" />
          <ul className="rail">
            {similar.map((entry) => (
              <li key={entry.movie.tmdbId}>
                <MovieCard movie={toSummary(entry.movie)} fit={toFit(entry.score)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

        <div className="mt-16 pt-6" style={{ borderTop: "1px solid var(--hairline)" }}>
          <ReturnControls tmdbId={movie.tmdbId} />
        </div>
      </div>
    </Surface>
  );
}
