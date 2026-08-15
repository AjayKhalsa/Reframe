/**
 * Projects the embedding space into the universe.
 *
 * Run with `npm run project`. Offline, deterministic, and the last stage of the
 * pipeline: everything the renderer needs is precomputed here so nothing is
 * calculated at runtime.
 *
 * Two outputs that are easy to conflate but must not be:
 *
 *   coordinates  where a film sits on screen — UMAP's 3D projection, which is
 *                a lossy but navigable *picture* of the space
 *   neighbours   which films are actually similar — computed in the full
 *                embedding space, never from the 3D positions
 *
 * Reading neighbours off the projection would be much cheaper and quietly
 * wrong: UMAP preserves local structure well but distorts distances, so films
 * that merely landed near each other on screen would be presented as related.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { UMAP } from "umap-js";

import {
  DEFAULT_WEIGHTS,
  similarity,
  type FilmVectors,
} from "../src/lib/embed/similarity";
import type { Movie } from "../src/lib/types";

/**
 * How many neighbours to store per film.
 *
 * Ten, because the deepest consumer (the nearby rail on a film's page) shows
 * ten. This is the dominant cost in the shipped payload — every extra
 * neighbour is another id on every film — so it is sized to what is actually
 * displayed rather than to what might be useful someday.
 */
const NEIGHBOURS = 10;

/** Half-extent of the universe in world units. */
const UNIVERSE_SCALE = 100;

const DATA = path.join(process.cwd(), "data");
const OUT = path.join(process.cwd(), "src", "lib", "data");

type VectorFile = {
  source: string;
  ids: number[];
  semantic: number[][];
  metadata: number[][];
};

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scales the projection into a fixed box so camera behaviour is independent of the data. */
function normalise(points: number[][]): number[][] {
  const axes = [0, 1, 2].map((axis) => {
    const values = points.map((p) => p[axis]);
    return { min: Math.min(...values), max: Math.max(...values) };
  });

  return points.map((point) =>
    point.map((value, axis) => {
      const { min, max } = axes[axis];
      const span = max - min || 1;
      return ((value - min) / span - 0.5) * 2 * UNIVERSE_SCALE;
    }),
  );
}

/**
 * Exact k-NN under the weighted similarity. Brute force is fine at this size.
 *
 * Uses the same `similarity` function the evaluation harness does, so the
 * graph that ships is the graph that was measured.
 */
function nearestNeighbours(vectors: FilmVectors[], k: number): number[][] {
  const total = vectors.length;
  const result: number[][] = [];

  for (let i = 0; i < total; i++) {
    // A small insertion-sorted top-k beats sorting all similarities.
    const best: Array<{ index: number; score: number }> = [];

    for (let j = 0; j < total; j++) {
      if (i === j) continue;
      const score = similarity(vectors[i], vectors[j]);
      if (best.length < k) {
        best.push({ index: j, score });
        best.sort((a, b) => b.score - a.score);
      } else if (score > best[best.length - 1].score) {
        best[best.length - 1] = { index: j, score };
        best.sort((a, b) => b.score - a.score);
      }
    }
    result.push(best.map((entry) => entry.index));
  }
  return result;
}

/*
 * Clustering used to happen here.
 *
 * It was removed once colour moved to genre: nothing consumed the cluster
 * index or the generated cluster names any more, so it was thirty k-means
 * iterations over every film to produce a field shipped to every visitor and
 * read by nobody. Regions in the map now emerge from overlapping per-film
 * auras rather than from an assignment, which is both truer to the data and
 * free.
 */

async function main() {
  const catalogue = JSON.parse(
    await readFile(path.join(DATA, "catalogue.json"), "utf8"),
  ) as Movie[];
  const file = JSON.parse(
    await readFile(path.join(DATA, "vectors.json"), "utf8"),
  ) as VectorFile;

  const byId = new Map(catalogue.map((movie) => [movie.tmdbId, movie]));
  const movies = file.ids.map((id) => byId.get(id)).filter((m): m is Movie => Boolean(m));

  const vectors: FilmVectors[] = file.ids.map((_, i) => ({
    story: Float64Array.from(file.semantic[i] ?? []),
    metadata: Float64Array.from(file.metadata[i]),
  }));

  /*
   * UMAP still consumes one fused vector.
   *
   * The projection only needs a space to lay out, and the weighted fusion is a
   * faithful enough stand-in for the layout's purposes. Neighbours — the part
   * that has to be *correct* — are computed separately below under the real
   * weighted similarity, never read off these coordinates.
   */
  const fused = vectors.map(({ story, metadata }) => {
    const out = new Float64Array(story.length + metadata.length);
    for (let i = 0; i < story.length; i++) out[i] = story[i] * DEFAULT_WEIGHTS.story;
    for (let i = 0; i < metadata.length; i++) {
      out[story.length + i] = metadata[i] * DEFAULT_WEIGHTS.metadata;
    }
    return Array.from(out);
  });

  console.log(`Projecting ${movies.length} films from ${file.source} vectors.\n`);

  console.log("UMAP → 3D…");
  const umap = new UMAP({
    nComponents: 3,
    // Larger than the default: smaller neighbourhoods produce a shattered map
    // of many tiny islands, which is accurate but impossible to navigate.
    nNeighbors: 18,
    minDist: 0.12,
    random: mulberry32(0x0dd1e),
  });
  const points = normalise(umap.fit(fused));
  console.log("  done\n");

  console.log("Nearest neighbours (full embedding space)…");
  const neighbours = nearestNeighbours(vectors, NEIGHBOURS);
  console.log("  done\n");

  // The renderer gets a deliberately slim record. Shipping full metadata for
  // every film would be megabytes on the wire for data the map never draws —
  // detail pages fetch the rest on demand. One decimal place on the
  // coordinates: the universe is 200 units across and a tenth of a unit is far
  // below one pixel at any usable camera distance.
  const nodes = movies.map((movie, index) => ({
    id: movie.tmdbId,
    t: movie.title,
    y: Number(movie.releaseDate?.slice(0, 4)) || null,
    p: movie.posterPath,
    x: Number(points[index][0].toFixed(1)),
    yy: Number(points[index][1].toFixed(1)),
    z: Number(points[index][2].toFixed(1)),
    n: neighbours[index].map((i) => movies[i].tmdbId),
    v: movie.voteCount,
    // Genres drive the colour of the film's aura. Three is enough for a blend
    // with character — beyond that every film averages toward the same muddy
    // middle, which defeats the point of colouring them at all.
    g: movie.genres.slice(0, 3),
  }));

  await mkdir(OUT, { recursive: true });
  await writeFile(
    path.join(OUT, "universe.json"),
    JSON.stringify({ source: file.source, scale: UNIVERSE_SCALE, nodes }),
    "utf8",
  );

  const bytes = JSON.stringify(nodes).length;
  console.log(`Wrote ${nodes.length} nodes (${(bytes / 1024).toFixed(0)} KB).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
