import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

/**
 * The universe, as the renderer needs it.
 *
 * Field names are one or two characters because this is the one payload that
 * ships in full to every visitor — at two thousand nodes, readable keys cost
 * more over the wire than the entire rest of the page. Everything else about a
 * film is fetched on demand when its page opens.
 */
export type UniverseNode = {
  /** TMDB id. */
  id: number;
  /** Title. */
  t: string;
  /** Release year. */
  y: number | null;
  /** Poster path. */
  p: string | null;
  /** Position. `yy` rather than `y` because `y` is already the year. */
  x: number;
  yy: number;
  z: number;
  /** Nearest neighbours, by TMDB id, nearest first. */
  n: number[];
  /** Vote count, used to decide which labels earn space at a distance. */
  v: number;
  /** Up to three genres. Drives the colour of the film's aura. */
  g: string[];
};

export type Universe = {
  /** "hybrid" or "metadata-only" — which embedding the map was built from. */
  source: string;
  /** Half-extent of the coordinate space. */
  scale: number;
  nodes: UniverseNode[];
};

const EMPTY: Universe = { source: "none", scale: 100, nodes: [] };

const UNIVERSE_PATH = path.join(process.cwd(), "src", "lib", "data", "universe.json");

/**
 * Reads the projected universe.
 *
 * Read from disk at request time rather than imported, so the app still builds
 * and runs before the pipeline has been run — an import of a missing JSON file
 * is a build error, which would make the repo unusable until a twenty-minute
 * embedding job finishes. `cache` dedupes within a request.
 */
export const readUniverse = cache(async (): Promise<Universe> => {
  try {
    return JSON.parse(await readFile(UNIVERSE_PATH, "utf8")) as Universe;
  } catch {
    return EMPTY;
  }
});
