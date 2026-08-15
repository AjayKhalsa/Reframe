/**
 * Builds the local movie cache from TMDB.
 *
 * Run with `npm run seed`. Resolves each title in `CURATED` to a TMDB record,
 * fetches full metadata, derives a palette from the poster, and writes
 * `src/lib/data/movies.json`.
 *
 * The palette is baked here so the first paint of a film is already in that
 * film's colours. Films that were never seeded get the same treatment on
 * demand — both paths call `paletteForPoster`, so a cached film and a freshly
 * fetched one can never theme differently.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getMovie, searchMovies } from "../src/lib/tmdb/client";
import { paletteForPoster } from "../src/lib/palette/server";
import type { Movie } from "../src/lib/types";

/**
 * A deliberately broad spread of palettes and tastes — Dune's sand, the
 * Matrix's green, In the Mood for Love's red, the Lighthouse's monochrome —
 * so the theme engine is exercised properly rather than flattered by a set of
 * films that all happen to be teal and orange.
 */
const CURATED: Array<[title: string, year: number]> = [
  ["The Nice Guys", 2016],
  ["Whiplash", 2014],
  ["The Social Network", 2010],
  ["Parasite", 2019],
  ["Dune", 2021],
  ["The Matrix", 1999],
  ["La La Land", 2016],
  ["The Godfather", 1972],
  ["Game Night", 2018],
  ["Kiss Kiss Bang Bang", 2005],
  ["Moneyball", 2011],
  ["Blade Runner 2049", 2017],
  ["Arrival", 2016],
  ["Gone Girl", 2014],
  ["Fight Club", 1999],
  ["Inception", 2010],
  ["Everything Everywhere All at Once", 2022],
  ["Past Lives", 2023],
  ["Sicario", 2015],
  ["Knives Out", 2019],
  ["The Grand Budapest Hotel", 2014],
  ["Mad Max: Fury Road", 2015],
  ["Her", 2013],
  ["Prisoners", 2013],
  ["Oldboy", 2003],
  ["In the Mood for Love", 2000],
  ["The Lighthouse", 2019],
  ["Uncut Gems", 2019],
  ["Nightcrawler", 2014],
  ["Portrait of a Lady on Fire", 2019],
  ["Drive", 2011],
  ["Se7en", 1995],
  ["Zodiac", 2007],
  ["Booksmart", 2019],
  ["Hunt for the Wilderpeople", 2016],
  ["Paddington 2", 2017],
  ["Anatomy of a Fall", 2023],
  ["Aftersun", 2022],
  ["The Banshees of Inisherin", 2022],
  ["Michael Clayton", 2007],
];

/**
 * TMDB's own rate limit is far higher than this. The constraint is local: each
 * film costs two API calls plus a poster download, and pushing more than a few
 * of those in parallel reliably drops connections.
 */
const CONCURRENCY = 3;

async function resolve(title: string, year: number): Promise<Movie | null> {
  const { hits } = await searchMovies(title);

  // TMDB's relevance ranking is good but not year-aware; an exact title+year
  // match beats it whenever one exists.
  const exact = hits.find(
    (h) =>
      h.title.toLowerCase() === title.toLowerCase() &&
      h.releaseDate?.startsWith(String(year)),
  );
  const sameYear = hits.find((h) => h.releaseDate?.startsWith(String(year)));
  const chosen = exact ?? sameYear ?? hits[0];

  if (!chosen) {
    console.warn(`! no TMDB match for "${title}" (${year})`);
    return null;
  }

  const movie = await getMovie(chosen.tmdbId);
  movie.palette = await paletteForPoster(movie.posterPath);

  const accent = movie.palette?.accent ?? "—";
  console.log(`  ${movie.title.padEnd(36)} ${accent}  ${movie.genres.join(", ")}`);
  return movie;
}

/** Simple worker pool — keeps output ordered while bounding in-flight requests. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

async function main() {
  console.log(`Seeding ${CURATED.length} films from TMDB\n`);

  const settled = await pool(CURATED, CONCURRENCY, async ([title, year]) => {
    try {
      return await resolve(title, year);
    } catch (error) {
      console.warn(`! failed "${title}": ${(error as Error).message}`);
      return null;
    }
  });

  const fresh = settled.filter((m): m is Movie => m !== null);

  const outDir = path.join(process.cwd(), "src", "lib", "data");
  const outPath = path.join(outDir, "movies.json");

  // Merge rather than overwrite. A run that loses three films to flaky sockets
  // should not also delete the thirty-seven it fetched last time.
  const existing = await readFile(outPath, "utf8")
    .then((raw) => JSON.parse(raw) as Movie[])
    .catch(() => [] as Movie[]);

  const byId = new Map(existing.map((m) => [m.tmdbId, m]));
  for (const movie of fresh) byId.set(movie.tmdbId, movie);

  const movies = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));

  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, `${JSON.stringify(movies, null, 2)}\n`, "utf8");

  const missed = CURATED.length - fresh.length;
  console.log(
    `\nWrote ${movies.length} films to src/lib/data/movies.json` +
      `\n  ${fresh.length} fetched this run, ${existing.length} already cached` +
      (missed > 0 ? `\n  ${missed} failed — re-run \`npm run seed\` to fill the gaps` : ""),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
