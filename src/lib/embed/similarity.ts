/**
 * What "similar" means.
 *
 * One definition, used by both the pipeline that builds the neighbour graph
 * and the harness that measures it. If those two ever disagreed, every
 * measurement would be of something other than what ships.
 *
 * The central decision is that **story dominates**. Two films sharing a
 * premise should be neighbours even across genres — Groundhog Day and Palm
 * Springs — while two films merely sharing a director and a genre should not
 * be, unless they also share something about what happens in them.
 *
 * That is only expressible because the signals are kept apart. Fused into one
 * vector, "same premise" and "same cast" become the same number.
 */

import { cosine, type Vector } from "./vector";

export type SimilarityWeights = {
  /** Premise, plot, themes — whatever the overview actually describes. */
  story: number;
  /** Genre, keywords, director, cast, era, language. */
  metadata: number;
};

/**
 * Weights, chosen by measurement rather than intuition.
 *
 * `npm run evaluate` sweeps this ratio against golden sets of films that share
 * a premise but not a genre. The result was decisive and went further than
 * expected: recall fell monotonically with every point of metadata added —
 * 67% at pure story, 47% at the 0.8/0.2 blend that used to ship, 13% at pure
 * metadata, which is close to chance.
 *
 * Not set to zero, though. Those golden sets are deliberately built from
 * cross-genre premises, so they are constructed to make metadata look bad and
 * cannot see the cases where it genuinely helps — a director's body of work, a
 * franchise. A tenth keeps that signal as a tie-breaker among films the story
 * vector already considers close, without letting it drag in a film merely for
 * sharing a cast.
 */
export const DEFAULT_WEIGHTS: SimilarityWeights = { story: 0.9, metadata: 0.1 };

export type FilmVectors = {
  /** May be empty when a film has no semantic vector yet. */
  story: Vector;
  metadata: Vector;
};

/**
 * Weighted similarity between two films.
 *
 * Each half is compared on its own and the results combined, rather than
 * comparing one concatenated vector. The difference matters: concatenation
 * lets a long, dense metadata vector quietly outvote a short story one
 * regardless of the weights, because magnitude leaks into the dot product.
 * Comparing separately means the weights mean exactly what they say.
 */
export function similarity(
  a: FilmVectors,
  b: FilmVectors,
  weights: SimilarityWeights = DEFAULT_WEIGHTS,
): number {
  const hasStory = a.story.length > 0 && b.story.length > 0;

  const storyScore = hasStory ? cosine(a.story, b.story) : 0;
  const metadataScore = cosine(a.metadata, b.metadata);

  // A film still awaiting its story vector is scored on metadata alone rather
  // than being penalised to zero, which would exile it from the map.
  if (!hasStory) return metadataScore;

  return storyScore * weights.story + metadataScore * weights.metadata;
}
