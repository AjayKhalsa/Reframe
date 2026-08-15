/**
 * Turns the catalogue into vectors.
 *
 * Run with `npm run embed`.
 *
 * Two embedders, blended. The semantic half (Gemini) reads the film as prose
 * and finds thematic relationships; the metadata half (local TF-IDF) knows
 * categorical facts like shared directors that prose embeddings underweight.
 * Neither alone produces a map worth exploring — semantic-only misses that two
 * films are by the same director, metadata-only just rebuilds the genre
 * taxonomy, which is the failure the brief explicitly warns against.
 *
 * Only the semantic half is cached, keyed by content hash: it is the only part
 * that costs anything. The local half is recomputed every run because TF-IDF
 * weights depend on the whole corpus, so adding films legitimately changes
 * every existing vector.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { contentHash, semanticDocument } from "../src/lib/embed/document";
import { embedLocal } from "../src/lib/embed/local";
import { embedSemantic, GEMINI_MODEL, hasGeminiKey } from "../src/lib/embed/gemini";
import { embedSemanticOpenAi, hasOpenAiKey } from "../src/lib/embed/openai";
import { l2Normalise, type Vector } from "../src/lib/embed/vector";
import type { Movie } from "../src/lib/types";

/*
 * The story/metadata weighting no longer lives here.
 *
 * It used to be applied at this stage, fusing the two halves into one vector
 * before anything downstream could see them apart. It now sits in
 * `src/lib/embed/similarity.ts` and is applied at comparison time, so the
 * ratio can be tuned and measured without re-embedding a single film.
 */

const DATA = path.join(process.cwd(), "data");
const CATALOGUE_PATH = path.join(DATA, "catalogue.json");
const VECTORS_PATH = path.join(DATA, "vectors.json");

/**
 * Provider selection.
 *
 * OpenAI when a key is present, because it batches — six thousand films in
 * minutes rather than the six days Gemini's per-film free-tier accounting
 * imposes. Gemini otherwise.
 */
const provider: "openai" | "gemini" | "none" = hasOpenAiKey()
  ? "openai"
  : hasGeminiKey()
    ? "gemini"
    : "none";

/**
 * Caches are keyed by the exact model, and never mixed.
 *
 * Two embedding models produce vectors in unrelated spaces — the cosine
 * similarity between a Gemini vector and an OpenAI one, or between two
 * different Gemini models, is not a small error but meaningless. Since
 * switching model is now a deliberate tactic (each carries its own free-tier
 * quota), the model name has to be part of the key or a switch would silently
 * corrupt the map by blending two spaces.
 *
 * It also means switching back costs nothing: each model's work is preserved.
 */
const modelKey = provider === "openai" ? "openai-3-small" : GEMINI_MODEL;
const CACHE_PATH = path.join(DATA, `semantic-cache.${modelKey}.json`);

/** The original cache, from before the split. Always gemini-embedding-001. */
const LEGACY_GEMINI_CACHE = path.join(DATA, "semantic-cache.json");

type Cache = Record<string, number[]>;

async function loadCache(): Promise<Cache> {
  const own = await readFile(CACHE_PATH, "utf8")
    .then((raw) => JSON.parse(raw) as Cache)
    .catch(() => null);
  if (own) return own;

  // The pre-split cache belongs to gemini-embedding-001 and only to it.
  if (GEMINI_MODEL === "gemini-embedding-001" && provider === "gemini") {
    const legacy = await readFile(LEGACY_GEMINI_CACHE, "utf8")
      .then((raw) => JSON.parse(raw) as Cache)
      .catch(() => null);
    if (legacy) {
      console.log(`Adopting ${Object.keys(legacy).length} vectors from the previous cache.\n`);
      return legacy;
    }
  }
  return {};
}

async function main() {
  const catalogue = JSON.parse(await readFile(CATALOGUE_PATH, "utf8")) as Movie[];
  if (catalogue.length === 0) {
    throw new Error("Catalogue is empty. Run `npm run ingest` first.");
  }
  console.log(`Embedding ${catalogue.length} films.\n`);

  console.log("Metadata half (local TF-IDF)…");
  const metadata = embedLocal(catalogue);
  console.log(`  ${metadata[0].length} dimensions\n`);

  const cache = await loadCache();

  const hashes = catalogue.map(contentHash);

  /*
   * Most-known films first.
   *
   * The free tier has a daily ceiling, so a full catalogue takes several runs
   * and any single run covers only part of it. The catalogue is stored sorted
   * by TMDB id, and embedding in that order means a partial map is a partial
   * map of *whatever was added to TMDB earliest* — which is a real bias, and
   * the first run produced a universe containing no film released after 2012.
   *
   * Ordering by vote count instead means the partial map is always the films
   * someone is most likely to search for.
   */
  const missing = catalogue
    .map((movie, index) => ({ movie, index }))
    .filter(({ index }) => !cache[hashes[index]])
    .sort((a, b) => b.movie.voteCount - a.movie.voteCount);

  let semantic: Array<Vector | null> | null = null;

  // Rebuilding the map after a weighting or filtering change should not cost a
  // day's quota, so there is a way to say "use only what is already cached".
  const noFetch = process.env.EMBED_NO_FETCH === "1";

  if (provider === "none") {
    console.log("No embedding key set — building from the metadata half alone.");
    console.log("That map clusters by genre. Add OPENAI_API_KEY or GEMINI_API_KEY.\n");
  } else if (noFetch) {
    console.log(`EMBED_NO_FETCH — using the ${Object.keys(cache).length} cached vectors as-is.\n`);
    semantic = hashes.map((hash) =>
      cache[hash] ? l2Normalise(Float64Array.from(cache[hash])) : null,
    );
  } else {
    console.log(
      `Semantic half (${provider}): ${missing.length} to fetch, ` +
        `${catalogue.length - missing.length} cached.`,
    );

    if (missing.length > 0) {
      await mkdir(DATA, { recursive: true });

      // Persist after every batch. A run is expected to stop partway — a daily
      // ceiling on Gemini, a spent balance on OpenAI — and what must never
      // happen is losing work already paid for.
      const documents = missing.map(({ movie }) => semanticDocument(movie));

      const persist = (cachePath: string) => async (vectors: Vector[], start: number) => {
        vectors.forEach((vector, offset) => {
          const { index } = missing[start + offset];
          cache[hashes[index]] = Array.from(vector);
        });
        await writeFile(cachePath, JSON.stringify(cache), "utf8");
      };
      const progress = (done: number, total: number) =>
        process.stdout.write(`\r  ${done}/${total}`);

      let { exhausted, completed } =
        provider === "openai"
          ? await embedSemanticOpenAi(documents, persist(CACHE_PATH), progress)
          : await embedSemantic(documents, persist(CACHE_PATH), progress);

      /*
       * Fall back to Gemini if OpenAI turns out to be unfunded.
       *
       * A key that authenticates but has no balance would otherwise silently
       * shut down embedding entirely — the run would prefer OpenAI, get
       * `insufficient_quota` on the first call, and stop, while a perfectly
       * good Gemini allowance sat unused. Having a second provider configured
       * should never make the pipeline worse than having one.
       */
      if (provider === "openai" && exhausted && completed === 0 && hasGeminiKey()) {
        console.log(`\n  OpenAI unavailable. Falling back to ${GEMINI_MODEL}.\n`);

        /*
         * Load only this model's own cache.
         *
         * An earlier version fell back to the pre-split cache whenever the
         * model's own file was missing — which meant switching to a new model
         * silently adopted 880 vectors from the *old* one and began writing
         * new-model vectors alongside them. Two unrelated spaces in one file:
         * exactly the corruption the per-model keying exists to prevent,
         * reintroduced by the recovery path. A missing cache means start
         * empty, always.
         */
        const geminiCache = path.join(DATA, `semantic-cache.${GEMINI_MODEL}.json`);
        for (const key of Object.keys(cache)) delete cache[key];
        Object.assign(
          cache,
          await readFile(geminiCache, "utf8")
            .then((raw) => JSON.parse(raw) as Cache)
            .catch(() => ({}) as Cache),
        );

        const stillMissing = missing.filter(({ index }) => !cache[hashes[index]]);
        ({ exhausted, completed } = await embedSemantic(
          stillMissing.map(({ movie }) => semanticDocument(movie)),
          async (vectors, start) => {
            vectors.forEach((vector, offset) => {
              const { index } = stillMissing[start + offset];
              cache[hashes[index]] = Array.from(vector);
            });
            await writeFile(geminiCache, JSON.stringify(cache), "utf8");
          },
          progress,
        ));
      }

      if (exhausted) {
        console.log(
          `\n  Rate limit reached. ${Object.keys(cache).length}/${catalogue.length} cached so far.` +
            `\n  Re-run \`npm run embed\` later to continue — nothing is lost.\n`,
        );
      } else {
        console.log("\n  done.");
      }
    }

    // Films still missing a semantic vector fall back to their metadata half
    // alone rather than blocking the whole map on a complete run.
    const covered = hashes.filter((hash) => cache[hash]).length;
    console.log(`  ${covered}/${catalogue.length} films have semantic vectors\n`);

    semantic = hashes.map((hash) =>
      cache[hash] ? l2Normalise(Float64Array.from(cache[hash])) : null,
    );
  }

  /*
   * Films without a semantic vector are dropped, not zero-padded.
   *
   * Zero-padding looks like the accommodating choice and is actively harmful:
   * every unembedded film would carry an identical 768-dimensional block of
   * zeros, which makes them all maximally similar *to each other*. UMAP would
   * duly gather them into a tight, entirely fictional cluster — a region of the
   * map meaning nothing but "we ran out of quota". A smaller honest map beats a
   * larger one with a lie in the middle of it.
   *
   * The dropped films are still in the catalogue and still have pages; they
   * simply are not placed until the next run fills them in.
   */
  const included = catalogue
    .map((movie, index) => ({ movie, index }))
    .filter(({ index }) => !semantic || semantic[index]);

  /*
   * The two halves are stored separately, not fused.
   *
   * Blending them into one vector here threw away the only control that
   * matters: how much a shared story counts against a shared director. Once
   * fused, "same genre" and "same premise" are indistinguishable to everything
   * downstream. Kept apart, similarity becomes a deliberate weighted decision
   * that can be tuned — and measured — without re-embedding anything.
   */
  const semanticOut = included.map(({ index }) =>
    semantic ? Array.from(semantic[index]!) : [],
  );
  const metadataOut = included.map(({ index }) => Array.from(metadata[index]));

  const dropped = catalogue.length - included.length;
  if (dropped > 0) {
    console.log(`Leaving ${dropped} films off the map until they have semantic vectors.`);
  }

  await mkdir(DATA, { recursive: true });
  await writeFile(
    VECTORS_PATH,
    JSON.stringify({
      // Recorded so the projection step can report what the map was built from,
      // and so a metadata-only map is never mistaken for the real thing.
      source: semantic ? "hybrid" : "metadata-only",
      ids: included.map(({ movie }) => movie.tmdbId),
      semantic: semanticOut,
      metadata: metadataOut,
    }),
    "utf8",
  );

  console.log(
    `Wrote ${included.length} films ` +
      `(${semanticOut[0]?.length ?? 0}d story + ${metadataOut[0].length}d metadata, ` +
      `${semantic ? "hybrid" : "metadata-only"}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
