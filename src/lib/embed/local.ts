/**
 * The metadata half of the embedding: TF-IDF over discrete tokens, reduced.
 *
 * This exists alongside the semantic embedder rather than instead of it,
 * because the two know different things. A text model reading an overview will
 * not reliably notice that two films share a director or a cinematographer's
 * favourite lead — those are categorical facts, and categorical facts are what
 * TF-IDF is good at.
 *
 * Needs no credentials and no network, so the universe can always be built.
 */

import { l2Normalise, type Vector } from "./vector";
import { metadataTokens } from "./document";
import type { Movie } from "../types";

/** Output dimensionality after reduction. Enough to preserve structure, small enough to project quickly. */
const COMPONENTS = 128;

/**
 * Relative weight per token family.
 *
 * A shared director is a much stronger signal of similarity than a shared
 * genre — "both are dramas" is nearly meaningless across a catalogue where
 * a third of everything is a drama.
 */
const FAMILY_WEIGHT: Record<string, number> = {
  g: 0.8, // genre
  k: 1.3, // keyword
  d: 2.0, // director
  c: 0.7, // cast
  l: 0.6, // language
  e: 0.5, // era
};

const familyOf = (token: string) => token.slice(0, 1);

/**
 * Builds TF-IDF vectors for the whole catalogue, then reduces them.
 *
 * IDF is what stops "drama" and "based on a novel" dominating: a token
 * appearing on half the catalogue carries almost no information, and the log
 * weighting expresses that automatically rather than needing a stop-list.
 */
export function embedLocal(movies: Movie[]): Vector[] {
  const documents = movies.map(metadataTokens);

  const documentFrequency = new Map<string, number>();
  for (const tokens of documents) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  // Tokens appearing once describe exactly one film and can only ever add
  // noise to a projection, so they are dropped before building the vocabulary.
  const vocabulary = new Map<string, number>();
  for (const [token, count] of documentFrequency) {
    if (count >= 2) vocabulary.set(token, vocabulary.size);
  }

  const total = movies.length;
  const sparse: Array<Map<number, number>> = documents.map((tokens) => {
    const row = new Map<number, number>();

    for (const token of tokens) {
      const index = vocabulary.get(token);
      if (index === undefined) continue;

      const idf = Math.log(total / (documentFrequency.get(token) ?? 1));
      const weight = idf * (FAMILY_WEIGHT[familyOf(token)] ?? 1);
      row.set(index, (row.get(index) ?? 0) + weight);
    }
    return row;
  });

  return reduce(sparse, vocabulary.size, COMPONENTS);
}

/**
 * Dimensionality reduction by random projection.
 *
 * Not SVD. The Johnson–Lindenstrauss lemma says a random projection preserves
 * pairwise distances to within a small error, which is all UMAP needs from
 * this stage — and it runs in one pass over sparse data instead of requiring
 * an iterative decomposition of a matrix with tens of thousands of columns.
 * The distances that matter are recomputed properly downstream.
 */
function reduce(
  sparse: Array<Map<number, number>>,
  vocabularySize: number,
  components: number,
): Vector[] {
  // Deterministic, so two runs over the same catalogue give the same map.
  const random = mulberry32(0x5eed);

  // Achlioptas' sparse projection: entries of ±1 with probability 1/6 each and
  // 0 otherwise. Two thirds of the matrix is zero, so it is both cheaper to
  // build and cheaper to apply than a dense Gaussian one.
  const projection: Int8Array[] = Array.from({ length: vocabularySize }, () => {
    const row = new Int8Array(components);
    for (let c = 0; c < components; c++) {
      const draw = random();
      if (draw < 1 / 6) row[c] = 1;
      else if (draw < 2 / 6) row[c] = -1;
    }
    return row;
  });

  return sparse.map((row) => {
    const out = new Float64Array(components);
    for (const [index, weight] of row) {
      const projectionRow = projection[index];
      for (let c = 0; c < components; c++) {
        if (projectionRow[c] !== 0) out[c] += weight * projectionRow[c];
      }
    }
    return l2Normalise(out);
  });
}

/** Small deterministic PRNG. Seeded so the universe is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
