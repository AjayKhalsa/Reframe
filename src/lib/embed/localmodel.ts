/**
 * The semantic half, computed here rather than bought.
 *
 * Same job as the Gemini and OpenAI providers, without the thing that shaped
 * both of them: a quota. An open embedding model running under ONNX has no
 * daily ceiling, no per-minute limit, no balance to run down and no 429 to
 * classify — which removes most of the machinery the hosted providers need and
 * all of the reasons a full catalogue took days rather than minutes.
 *
 * What that buys is not only speed. It makes the embedding cache an
 * optimisation instead of an irreplaceable asset: losing it costs minutes of
 * CPU, so a CI runner with a cold cache is an inconvenience rather than a
 * six-day setback, and the map stops being hostage to a free tier.
 */

import type { Vector } from "./vector";
import { l2Normalise } from "./vector";

/**
 * Which model.
 *
 * BGE-small is the default because it is the best ratio of quality to size in
 * this class — competitive on retrieval benchmarks with models several times
 * its weight, and small enough that a CI runner downloads it in seconds. The
 * whole point of this provider is that running the model is cheap, and a model
 * too heavy to run in CI would give that back.
 *
 * As with every other provider, changing this invalidates the entire map:
 * vectors from two models cannot be compared, so a switch is a full re-embed.
 * The cache is keyed by this name to make mixing them impossible by accident.
 */
export const LOCAL_MODEL = process.env.LOCAL_EMBED_MODEL ?? "Xenova/bge-small-en-v1.5";

/**
 * Where the weights live.
 *
 * Unset, the model is fetched from Hugging Face on first use and cached by
 * transformers.js. Set, nothing is fetched at all — which is what makes the
 * provider genuinely offline, and how it runs somewhere with no route to
 * huggingface.co.
 */
const MODEL_PATH = process.env.LOCAL_EMBED_MODEL_PATH;

/**
 * Per-model conventions, which are not cosmetic.
 *
 * Embedding models are trained with a specific pooling strategy and, in some
 * families, a required prefix on every input. Get either wrong and the model
 * still returns confident, plausible, correctly-shaped vectors that are simply
 * worse — there is no error, and nothing downstream can tell. The E5 family in
 * particular collapses without its prefix, and it is mean-pooled where BGE is
 * CLS-pooled.
 *
 * Detected from the model name, overridable for anything not listed.
 */
function conventionsFor(model: string): { pooling: "cls" | "mean"; prefix: string } {
  const name = model.toLowerCase();

  // E5 asks for "query: " on both sides of a symmetric comparison — the
  // query/passage split is for asymmetric retrieval, which this is not.
  if (name.includes("e5")) return { pooling: "mean", prefix: "query: " };
  if (name.includes("bge")) return { pooling: "cls", prefix: "" };
  return { pooling: "mean", prefix: "" };
}

const POOLING = (process.env.LOCAL_EMBED_POOLING as "cls" | "mean" | undefined) ??
  conventionsFor(LOCAL_MODEL).pooling;
const PREFIX = process.env.LOCAL_EMBED_PREFIX ?? conventionsFor(LOCAL_MODEL).prefix;

/**
 * Documents per forward pass.
 *
 * Nothing external is being rationed here, so this is tuned for memory rather
 * than for a quota: every document in a batch is padded to the longest one in
 * it, so an oversized batch spends most of its time multiplying padding.
 */
const BATCH_SIZE = Number(process.env.LOCAL_EMBED_BATCH_SIZE ?? 32);

/**
 * How much of a film is read.
 *
 * A `semanticDocument` is a title, a tagline, an overview and a theme list —
 * comfortably inside this. Truncation is a guard against the occasional
 * outlier, not a routine event.
 */
const MAX_TOKENS = 512;

/** The provider is always available: there is no key to check for. */
export function hasLocalModel(): boolean {
  return true;
}

type Extractor = (
  texts: string[],
  options: { pooling: "cls" | "mean"; normalize: boolean },
) => Promise<{ dims: number[]; data: Float32Array | number[] }>;

let extractor: Promise<Extractor> | null = null;

/**
 * Loaded once, lazily.
 *
 * The import is dynamic so that merely importing this module — which
 * `scripts/embed.ts` does on every run, whichever provider is selected — does
 * not drag the ONNX runtime into memory for a run that never touches it.
 */
function load(): Promise<Extractor> {
  extractor ??= (async () => {
    const { env, pipeline } = await import("@huggingface/transformers");

    if (MODEL_PATH) {
      // Local weights are not a cache to fall back from: if they are wrong or
      // missing, failing is far better than silently reaching for the network
      // and embedding half a catalogue with whatever it finds.
      env.allowRemoteModels = false;
      env.localModelPath = MODEL_PATH;
    }

    console.log(`  loading ${LOCAL_MODEL}${MODEL_PATH ? ` from ${MODEL_PATH}` : ""}…`);
    return (await pipeline("feature-extraction", LOCAL_MODEL)) as unknown as Extractor;
  })();

  return extractor;
}

/**
 * Embeds documents in order, handing each batch back as it completes.
 *
 * Deliberately the same signature as the hosted providers, including the
 * `exhausted` flag that can never be true here. The alternative — a second,
 * simpler contract for the local case — would mean `embed.ts` growing a branch
 * for which kind of provider it is holding, and the interesting logic there
 * (ordering by vote count, per-batch persistence, dropping unembedded films
 * rather than zero-padding them) applies identically either way.
 */
export async function embedSemanticLocal(
  documents: string[],
  onBatch: (vectors: Vector[], startIndex: number) => Promise<void> | void,
  onProgress?: (done: number, total: number) => void,
): Promise<{ completed: number; exhausted: boolean }> {
  const embed = await load();
  let completed = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents
      .slice(i, i + BATCH_SIZE)
      // Cheap character-level guard so a pathological overview cannot blow up
      // the padded batch; the tokenizer truncates properly underneath.
      .map((text) => PREFIX + text.slice(0, MAX_TOKENS * 8));

    const output = await embed(batch, { pooling: POOLING, normalize: true });

    const width = output.dims[output.dims.length - 1];
    const flat = output.data;
    const vectors: Vector[] = [];
    for (let row = 0; row < batch.length; row++) {
      const start = row * width;
      // Normalised on the way out already, but l2Normalise is what every other
      // provider guarantees and the cost of being certain is nil.
      vectors.push(l2Normalise(Float64Array.from(flat.slice(start, start + width))));
    }

    await onBatch(vectors, i);
    completed += vectors.length;
    onProgress?.(completed, documents.length);
  }

  return { completed, exhausted: false };
}
