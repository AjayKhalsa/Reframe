/**
 * Builds the Reframe catalogue from TMDB.
 *
 * Run with `npm run ingest`. Resumable: every film is written to
 * `data/catalogue.json` as it arrives and already-known ids are skipped, so a
 * run that dies halfway costs nothing. Given the connection-reset rate observed
 * against TMDB from this machine, a 2,000-film crawl that could not resume
 * would essentially never complete.
 *
 * Discovery is deliberately stratified rather than "top 2,000 by popularity".
 * A popularity-ordered crawl returns a decade of English-language blockbusters,
 * and a map built from that has nothing interesting in it — the whole premise
 * needs films spread across eras, languages and levels of acclaim.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getMovie, searchDiscover } from "../src/lib/tmdb/client";
import type { Movie } from "../src/lib/types";

/**
 * Catalogue size.
 *
 * The prototype phase is over, so this is now sized for a real map. Ingestion
 * is not the bottleneck — embedding is, and it advances about a thousand films
 * a day on the free tier. A large catalogue simply means the embedder always
 * has the best remaining film to work on next.
 */
const TARGET = Number(process.env.INGEST_TARGET ?? 6000);

/**
 * Films need enough votes that their metadata is real, but not so many that
 * only blockbusters qualify.
 *
 * Lower than the prototype's threshold because the catalogue is now three
 * times larger — at 150 the deeper strata simply run out of films.
 */
const MIN_VOTES = 80;

/** Concurrency for the detail fetches. Higher than this drops connections locally. */
const CONCURRENCY = 4;

const CATALOGUE_PATH = path.join(process.cwd(), "data", "catalogue.json");

type Stratum = {
  name: string;
  from: string;
  to: string;
  language?: string;
  /** Share of TARGET this stratum should contribute. */
  weight: number;
};

/**
 * The shape of the catalogue.
 *
 * Recent decades get more weight because that is what people have actually
 * seen, but not so much that the map becomes a map of the 2010s. The
 * international strata are separate rather than hoped-for: left to its own
 * ranking TMDB returns almost entirely English-language films.
 */
const STRATA: Stratum[] = [
  // Hollywood first — roughly three quarters of the catalogue, split by decade
  // so it is a map of English-language cinema rather than a map of the 2010s.
  { name: "EN 1930s–50s", from: "1930-01-01", to: "1959-12-31", language: "en", weight: 0.035 },
  { name: "EN 1960s", from: "1960-01-01", to: "1969-12-31", language: "en", weight: 0.03 },
  { name: "EN 1970s", from: "1970-01-01", to: "1979-12-31", language: "en", weight: 0.045 },
  { name: "EN 1980s", from: "1980-01-01", to: "1989-12-31", language: "en", weight: 0.075 },
  { name: "EN 1990s", from: "1990-01-01", to: "1999-12-31", language: "en", weight: 0.105 },
  { name: "EN 2000s", from: "2000-01-01", to: "2009-12-31", language: "en", weight: 0.13 },
  { name: "EN 2010s", from: "2010-01-01", to: "2019-12-31", language: "en", weight: 0.17 },
  { name: "EN 2020s", from: "2020-01-01", to: "2026-12-31", language: "en", weight: 0.14 },

  // The rest of world cinema. Kept deliberately, and not as a token gesture:
  // a similarity map whose every neighbourhood is American is a worse map, and
  // some of the most interesting adjacencies in the space cross languages.
  { name: "Japanese", from: "1950-01-01", to: "2026-12-31", language: "ja", weight: 0.045 },
  { name: "Korean", from: "1990-01-01", to: "2026-12-31", language: "ko", weight: 0.035 },
  { name: "French", from: "1950-01-01", to: "2026-12-31", language: "fr", weight: 0.04 },
  { name: "Spanish", from: "1970-01-01", to: "2026-12-31", language: "es", weight: 0.03 },
  { name: "Hindi", from: "1970-01-01", to: "2026-12-31", language: "hi", weight: 0.03 },
  { name: "Italian", from: "1950-01-01", to: "2026-12-31", language: "it", weight: 0.025 },
  { name: "Mandarin", from: "1980-01-01", to: "2026-12-31", language: "zh", weight: 0.02 },
  { name: "German", from: "1950-01-01", to: "2026-12-31", language: "de", weight: 0.02 },
  { name: "Danish/Swedish", from: "1950-01-01", to: "2026-12-31", language: "sv", weight: 0.01 },
  { name: "Portuguese", from: "1980-01-01", to: "2026-12-31", language: "pt", weight: 0.01 },
  { name: "Russian", from: "1950-01-01", to: "2026-12-31", language: "ru", weight: 0.01 },
];

async function loadCatalogue(): Promise<Map<number, Movie>> {
  const existing = await readFile(CATALOGUE_PATH, "utf8")
    .then((raw) => JSON.parse(raw) as Movie[])
    .catch(() => [] as Movie[]);
  return new Map(existing.map((movie) => [movie.tmdbId, movie]));
}

async function saveCatalogue(catalogue: Map<number, Movie>) {
  await mkdir(path.dirname(CATALOGUE_PATH), { recursive: true });
  const movies = [...catalogue.values()].sort((a, b) => a.tmdbId - b.tmdbId);
  await writeFile(CATALOGUE_PATH, `${JSON.stringify(movies)}\n`, "utf8");
}

/** Collects candidate ids for one stratum, walking discover pages until the quota is met. */
async function collectIds(stratum: Stratum, quota: number): Promise<number[]> {
  const ids: number[] = [];
  // Twenty results a page, so a stratum wanting a thousand films needs fifty.
  // TMDB caps discover at 500 pages; we never get near that, but guard anyway.
  for (let page = 1; page <= 60 && ids.length < quota; page++) {
    try {
      const results = await searchDiscover({
        page,
        minVotes: MIN_VOTES,
        releasedFrom: stratum.from,
        releasedTo: stratum.to,
        language: stratum.language,
      });
      if (results.length === 0) break;
      ids.push(...results.map((r) => r.tmdbId));
    } catch (error) {
      console.warn(`  ! ${stratum.name} page ${page}: ${(error as Error).message}`);
      break;
    }
  }
  return ids.slice(0, quota);
}

/** Bounded worker pool. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await fn(items[cursor++]);
    }),
  );
}

async function main() {
  const catalogue = await loadCatalogue();
  console.log(`Starting from ${catalogue.size} cached films. Target ${TARGET}.\n`);

  console.log("Collecting candidates…");
  const wanted = new Set<number>();

  for (const stratum of STRATA) {
    const quota = Math.round(TARGET * stratum.weight);
    const ids = await collectIds(stratum, quota);
    for (const id of ids) wanted.add(id);
    console.log(`  ${stratum.name.padEnd(12)} ${ids.length} candidates`);
  }

  const missing = [...wanted].filter((id) => !catalogue.has(id));
  console.log(`\n${wanted.size} candidates, ${missing.length} to fetch.\n`);

  let done = 0;
  let failed = 0;
  let sinceSave = 0;

  await pool(missing, CONCURRENCY, async (id) => {
    try {
      catalogue.set(id, await getMovie(id));
      done++;
    } catch {
      failed++;
    }

    // Checkpoint regularly so a crash never costs more than a few films.
    if (++sinceSave >= 50) {
      sinceSave = 0;
      await saveCatalogue(catalogue);
      process.stdout.write(`\r  fetched ${done}/${missing.length} (${failed} failed)`);
    }
  });

  await saveCatalogue(catalogue);

  console.log(`\r  fetched ${done}/${missing.length} (${failed} failed)          `);
  console.log(`\nCatalogue now holds ${catalogue.size} films.`);
  if (failed > 0) console.log("Re-run `npm run ingest` to pick up the failures.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
