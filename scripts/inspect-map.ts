/**
 * Does the map know anything?
 *
 * Run with `npm run inspect`. This is the MVP test from the brief, made
 * checkable: search The Social Network and you should find Moneyball, Steve
 * Jobs, Whiplash — films that share ambition and obsession without sharing a
 * genre. If instead you get "other dramas from 2010", the embedding has just
 * rebuilt the genre taxonomy and no amount of rendering will save it.
 *
 * Worth running before building anything on top of a new map.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Universe } from "../src/lib/universe/data";

/** Films whose neighbourhoods say the most about whether the map works. */
const PROBES = [
  "The Social Network",
  "Whiplash",
  "Parasite",
  "Mad Max: Fury Road",
  "In the Mood for Love",
  "The Grand Budapest Hotel",
];

async function main() {
  const universe = JSON.parse(
    await readFile(path.join(process.cwd(), "src", "lib", "data", "universe.json"), "utf8"),
  ) as Universe;

  const byId = new Map(universe.nodes.map((node) => [node.id, node]));

  console.log(`Map built from: ${universe.source}`);
  console.log(`${universe.nodes.length} films\n`);

  for (const title of PROBES) {
    const node = universe.nodes.find(
      (candidate) => candidate.t.toLowerCase() === title.toLowerCase(),
    );

    if (!node) {
      console.log(`${title} — not in the catalogue\n`);
      continue;
    }

    console.log(`${node.t} (${node.y ?? "?"})`);
    for (const id of node.n.slice(0, 8)) {
      const neighbour = byId.get(id);
      if (neighbour) console.log(`   ${neighbour.t} (${neighbour.y ?? "?"})`);
    }
    console.log();
  }

  /*
   * Reciprocity as a structure check.
   *
   * A map where everything is equally close to everything is a map of nothing,
   * and that failure is invisible in the probe lists above. If A's neighbours
   * genuinely include B, then B's should usually include A — in a degenerate
   * space where all distances are near-identical, that agreement collapses to
   * chance. High reciprocity means the neighbourhoods are real.
   */
  const neighbourSets = new Map(universe.nodes.map((n) => [n.id, new Set(n.n)]));
  let mutual = 0;
  let total = 0;

  for (const node of universe.nodes) {
    for (const id of node.n) {
      total++;
      if (neighbourSets.get(id)?.has(node.id)) mutual++;
    }
  }

  console.log(
    `Neighbour reciprocity: ${((mutual / Math.max(total, 1)) * 100).toFixed(0)}%` +
      ` (low would mean the space has no real structure)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
