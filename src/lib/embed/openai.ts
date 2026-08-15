/**
 * OpenAI embeddings.
 *
 * Exists alongside the Gemini provider for one reason: batching. Gemini's free
 * tier bills every film in a batch as its own request against a 1,000/day
 * allowance, so the catalogue advances a thousand films a day no matter how
 * the requests are shaped. OpenAI counts a batch of up to 2,048 inputs as one
 * request, which turns six thousand films into a handful of calls and a few
 * minutes.
 *
 * There is no free tier here — it needs billing enabled — but
 * text-embedding-3-small is $0.02 per million tokens, so the whole catalogue
 * costs a few cents.
 */

import type { Vector } from "./vector";
import { l2Normalise } from "./vector";
import { QuotaExhausted, RateLimited } from "./gemini";

const ENDPOINT = "https://api.openai.com/v1/embeddings";

const MODEL = "text-embedding-3-small";

/**
 * Output dimensions.
 *
 * Matched to Gemini's 768 so the two providers produce interchangeable-shaped
 * vectors and nothing downstream has to care which was used. The model is
 * Matryoshka-trained, so a shortened vector is still a valid one.
 *
 * They are *not* interchangeable in meaning — a vector from one provider
 * cannot be compared against a vector from the other — which is why switching
 * provider means re-embedding the catalogue rather than topping it up.
 */
export const OPENAI_DIMENSIONS = 768;

/** The API accepts 2,048 inputs per call; this leaves headroom on payload size. */
const BATCH_SIZE = 256;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

type Response = { data: Array<{ index: number; embedding: number[] }> };

async function embedBatch(texts: string[], apiKey: string): Promise<Vector[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(2_000 * 2 ** attempt);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input: texts,
          dimensions: OPENAI_DIMENSIONS,
        }),
      });

      // 429 here means rate, not budget — OpenAI reports an exhausted balance
      // as a 429 with an `insufficient_quota` code, so the body decides which.
      if (res.status === 429) {
        const body = await res.text().catch(() => "");
        if (body.includes("insufficient_quota")) {
          throw new QuotaExhausted(`OpenAI: ${body.replace(/\s+/g, " ").slice(0, 200)}`);
        }
        lastError = new RateLimited("OpenAI 429 (rate)");
        continue;
      }
      if (res.status >= 500) {
        lastError = new RateLimited(`OpenAI ${res.status}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(
          `OpenAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`,
        );
      }

      const json = (await res.json()) as Response;

      // The API does not guarantee input order in the response.
      const ordered = new Array<Vector>(texts.length);
      for (const item of json.data) {
        ordered[item.index] = l2Normalise(Float64Array.from(item.embedding));
      }
      return ordered;
    } catch (error) {
      if (error instanceof QuotaExhausted) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new RateLimited("OpenAI batch failed");
}

/**
 * Embeds documents in order, handing each batch back as it completes.
 *
 * Same contract as the Gemini provider so the two are interchangeable, and the
 * same per-batch persistence so an interrupted run keeps what it paid for.
 */
export async function embedSemanticOpenAi(
  documents: string[],
  onBatch: (vectors: Vector[], startIndex: number) => Promise<void> | void,
  onProgress?: (done: number, total: number) => void,
): Promise<{ completed: number; exhausted: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  let completed = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    try {
      const vectors = await embedBatch(documents.slice(i, i + BATCH_SIZE), apiKey);
      await onBatch(vectors, i);
      completed += vectors.length;
      onProgress?.(completed, documents.length);
    } catch (error) {
      if (error instanceof QuotaExhausted) {
        console.warn(`\n  ${error.message}`);
        return { completed, exhausted: true };
      }
      throw error;
    }
  }

  return { completed, exhausted: false };
}
