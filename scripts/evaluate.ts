/**
 * Is the similarity any good?
 *
 * Run with `npm run evaluate`.
 *
 * Everything upstream of this is opinion. Looking at Zodiac's neighbours and
 * deciding they "seem right" is not evidence — it is confirmation bias with a
 * screenshot. This turns the question into a number.
 *
 * The method: golden sets of films a person would obviously group together,
 * chosen so that **genre cannot get you there**. Groundhog Day, Palm Springs
 * and Edge of Tomorrow share a premise and nothing else; a system that scores
 * well on that set has genuinely learned something about story. Then measure
 * recall@K — of the films that should appear in a title's neighbours, how many
 * actually do.
 *
 * It also sweeps the story/metadata weighting, so the split is chosen by
 * evidence rather than asserted.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { similarity, type FilmVectors, type SimilarityWeights } from "../src/lib/embed/similarity";
import type { Movie } from "../src/lib/types";

/** Neighbourhood size to measure at. */
const K = 20;

/**
 * Golden sets.
 *
 * Each is a concept, not a genre. Several deliberately cut across genre
 * boundaries — that is the entire point, because a genre-driven system will
 * score near zero on them while looking perfectly reasonable elsewhere.
 */
const GOLDEN: Array<{ concept: string; films: string[] }> = [
  {
    concept: "Time loops",
    films: ["Groundhog Day", "Palm Springs", "Happy Death Day", "Edge of Tomorrow", "Source Code"],
  },
  {
    concept: "Obsession and ambition",
    films: [
      "Whiplash",
      "Black Swan",
      "Nightcrawler",
      "There Will Be Blood",
      "The Social Network",
    ],
  },
  {
    concept: "Heists",
    films: ["Heat", "Ocean's Eleven", "Inside Man", "The Town", "The Italian Job"],
  },
  {
    concept: "Unreliable reality",
    films: ["Fight Club", "Memento", "Shutter Island", "The Machinist", "Mulholland Drive"],
  },
  {
    concept: "Serial killer investigations",
    films: ["Se7en", "Zodiac", "The Silence of the Lambs", "Memories of Murder", "Prisoners"],
  },
  {
    concept: "Coming of age",
    films: ["Lady Bird", "Boyhood", "Stand by Me", "Call Me by Your Name", "Moonlight"],
  },
  {
    concept: "Lonely connection",
    films: ["Lost in Translation", "Her", "Before Sunrise", "In the Mood for Love", "Past Lives"],
  },
  {
    concept: "Space survival",
    films: ["Gravity", "The Martian", "Apollo 13", "Interstellar", "Moon"],
  },
  {
    concept: "Organised crime sagas",
    films: ["Goodfellas", "The Godfather", "Casino", "Scarface", "Once Upon a Time in America"],
  },
  {
    concept: "Dystopian control",
    films: ["Brazil", "Children of Men", "V for Vendetta", "Nineteen Eighty-Four", "Gattaca"],
  },
];

type VectorFile = {
  source: string;
  ids: number[];
  semantic: number[][];
  metadata: number[][];
};

function recallFor(
  weights: SimilarityWeights,
  vectors: FilmVectors[],
  indexByTitle: Map<string, number>,
  titles: string[],
): { overall: number; perConcept: Array<{ concept: string; recall: number; found: number; possible: number }> } {
  const perConcept: Array<{ concept: string; recall: number; found: number; possible: number }> = [];
  let totalFound = 0;
  let totalPossible = 0;

  for (const { concept, films } of GOLDEN) {
    const present = films
      .map((title) => indexByTitle.get(title.toLowerCase()))
      .filter((index): index is number => index !== undefined);

    // A concept with fewer than two of its films in the map cannot be scored.
    if (present.length < 2) continue;

    let found = 0;
    let possible = 0;

    for (const index of present) {
      const scored = vectors
        .map((other, otherIndex) => ({
          otherIndex,
          score: otherIndex === index ? -Infinity : similarity(vectors[index], other, weights),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, K);

      const neighbours = new Set(scored.map((s) => s.otherIndex));
      for (const sibling of present) {
        if (sibling === index) continue;
        possible++;
        if (neighbours.has(sibling)) found++;
      }
    }

    perConcept.push({ concept, recall: found / possible, found, possible });
    totalFound += found;
    totalPossible += possible;
  }

  void titles;
  return { overall: totalPossible === 0 ? 0 : totalFound / totalPossible, perConcept };
}

async function main() {
  const DATA = path.join(process.cwd(), "data");
  const catalogue = JSON.parse(
    await readFile(path.join(DATA, "catalogue.json"), "utf8"),
  ) as Movie[];
  const file = JSON.parse(await readFile(path.join(DATA, "vectors.json"), "utf8")) as VectorFile;

  const byId = new Map(catalogue.map((movie) => [movie.tmdbId, movie]));
  const titles = file.ids.map((id) => byId.get(id)?.title ?? "");

  const vectors: FilmVectors[] = file.ids.map((_, i) => ({
    story: Float64Array.from(file.semantic[i] ?? []),
    metadata: Float64Array.from(file.metadata[i]),
  }));

  const indexByTitle = new Map<string, number>();
  titles.forEach((title, index) => {
    if (title) indexByTitle.set(title.toLowerCase(), index);
  });

  // Coverage first. A recall figure computed over three films is noise, and
  // reporting it without saying so would be the same self-deception the
  // harness exists to prevent.
  console.log(`Map: ${file.ids.length} films (${file.source})\n`);
  console.log("Golden set coverage:");
  let scorable = 0;
  for (const { concept, films } of GOLDEN) {
    const present = films.filter((t) => indexByTitle.has(t.toLowerCase()));
    if (present.length >= 2) scorable++;
    console.log(
      `  ${concept.padEnd(30)} ${present.length}/${films.length}` +
        (present.length < 2 ? "  (not scorable)" : ""),
    );
  }
  console.log(`\n${scorable}/${GOLDEN.length} concepts scorable.\n`);

  if (scorable === 0) {
    console.log("Not enough golden films embedded yet to measure anything.");
    return;
  }

  console.log(`Recall@${K} by story/metadata weighting:\n`);
  const sweep: SimilarityWeights[] = [
    { story: 1.0, metadata: 0.0 },
    { story: 0.9, metadata: 0.1 },
    { story: 0.8, metadata: 0.2 },
    { story: 0.7, metadata: 0.3 },
    { story: 0.5, metadata: 0.5 },
    { story: 0.3, metadata: 0.7 },
    { story: 0.0, metadata: 1.0 },
  ];

  let best = { weights: sweep[0], overall: -1 };
  for (const weights of sweep) {
    const { overall } = recallFor(weights, vectors, indexByTitle, titles);
    const bar = "█".repeat(Math.round(overall * 40));
    console.log(
      `  story ${weights.story.toFixed(1)} / meta ${weights.metadata.toFixed(1)}  ` +
        `${(overall * 100).toFixed(1).padStart(5)}%  ${bar}`,
    );
    if (overall > best.overall) best = { weights, overall };
  }

  console.log(
    `\nBest: story ${best.weights.story} / metadata ${best.weights.metadata} ` +
      `at ${(best.overall * 100).toFixed(1)}%\n`,
  );

  console.log("Per concept, at the best weighting:");
  for (const row of recallFor(best.weights, vectors, indexByTitle, titles).perConcept) {
    console.log(
      `  ${row.concept.padEnd(30)} ${(row.recall * 100).toFixed(0).padStart(3)}%  (${row.found}/${row.possible})`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
