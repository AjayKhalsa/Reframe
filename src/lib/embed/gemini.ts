/**
 * The semantic half of the embedding.
 *
 * This is the part that finds the relationships the product exists to show —
 * that The Social Network sits near Whiplash and Moneyball because all three
 * are about ambition and obsession, which is stated nowhere in their metadata
 * and everywhere in their prose.
 *
 * Runs offline, once. Vectors are cached by content hash, so re-running the
 * pipeline costs nothing and the free tier is ample.
 */

import type { Vector } from "./vector";
import { l2Normalise } from "./vector";

/**
 * Which embedding model to use.
 *
 * Each model carries its **own** free-tier quota pool, which is the cheapest
 * lever available when one is exhausted — switching model buys a fresh
 * thousand today rather than waiting for midnight Pacific.
 *
 * The catch is that models are not interchangeable mid-catalogue: vectors from
 * two different models occupy unrelated spaces and cannot be compared. So a
 * switch means re-embedding everything, and the cache is keyed by model name
 * to make mixing them impossible by accident.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-embedding-2";

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:batchEmbedContents`;

/**
 * Truncation dimension.
 *
 * gemini-embedding-001 is Matryoshka-trained, so a truncated prefix is still a
 * valid embedding. 768 keeps essentially all the useful structure at a quarter
 * the storage and projection cost of the full 3072.
 */
export const GEMINI_DIMENSIONS = 768;

/**
 * Films per request.
 *
 * Small deliberately. The free tier appears to bill each *content* in a batch
 * as a request rather than the batch as one, so a large batch is not the free
 * win it looks like — and a small batch means a rate-limit stall loses almost
 * nothing.
 */
const BATCH_SIZE = 20;

/**
 * Throttle, in films per minute.
 *
 * Measured against contents rather than HTTP requests, for the reason above.
 * Overridable so a paid key can go faster without touching the code.
 */
const FILMS_PER_MINUTE = Number(process.env.GEMINI_FILMS_PER_MINUTE ?? 80);

/** Consecutive failed batches before giving up on transient faults. */
const GIVE_UP_AFTER = 4;

/**
 * Films to embed in one run.
 *
 * The free tier allows 1,000 embed requests a day and counts each film in a
 * batch as one request, so batching buys nothing here — a thousand films is
 * the hard daily ceiling. Stopping just under it means the run ends by
 * choice with a clear message rather than by walking into a wall of 429s.
 *
 * Raise it on a paid key, where the limit is money rather than requests.
 */
const DAILY_BUDGET = Number(process.env.GEMINI_DAILY_BUDGET ?? 950);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BatchResponse = { embeddings: Array<{ values: number[] }> };

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function embedBatch(texts: string[], apiKey: string): Promise<Vector[]> {
  const body = {
    requests: texts.map((text) => ({
      model: `models/${GEMINI_MODEL}`,
      content: { parts: [{ text }] },
      // The map is built from "how similar are these two films", which is
      // exactly what this task type optimises the vector space for.
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: GEMINI_DIMENSIONS,
    })),
  };

  let lastError: unknown;
  // Three, not six. The outer loop now tolerates failed batches, so this only
  // needs to ride out a brief blip — grinding through six escalating backoffs
  // per batch just made a genuinely exhausted quota take half an hour to detect.
  for (let attempt = 0; attempt < 3; attempt++) {
    // A rate limit clears on a clock, so back off in whole tens of seconds
    // rather than the sub-second retries that suit a dropped connection.
    if (attempt > 0) await sleep(20_000 * attempt);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });

      /*
       * A 429 is never retried.
       *
       * The free tier bills *per content*, not per request, so a twenty-film
       * batch spends twenty of the thousand-a-day allowance — and every retry
       * of a rejected batch spends twenty more. Retrying a quota error cannot
       * succeed and actively destroys the budget it is waiting for. Only
       * genuine server faults are worth another attempt.
       */
      if (res.status === 429) {
        throw new QuotaExhausted(
          `Gemini quota: ${(await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200)}`,
        );
      }
      if (res.status >= 500) {
        lastError = new RateLimited(`Gemini ${res.status}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => "")}`);
      }

      const json = (await res.json()) as BatchResponse;
      return json.embeddings.map((embedding) =>
        // Truncated Matryoshka vectors are not unit length; normalising is
        // required before they can be blended or compared by dot product.
        l2Normalise(Float64Array.from(embedding.values)),
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new RateLimited("Gemini batch failed");
}

/** A transient server fault. Worth another attempt. */
export class RateLimited extends Error {}

/**
 * The daily allowance is gone.
 *
 * Distinct from `RateLimited` because the correct response is opposite:
 * stop immediately rather than retry. Waiting inside a run does not help —
 * the budget resets on a calendar day, not a timer.
 */
export class QuotaExhausted extends Error {}

/**
 * Embeds documents in order, handing each batch back as it completes.
 *
 * The callback is the important part of this signature. Returning everything
 * at the end means a rate limit two thirds of the way through a 2,000-film run
 * discards two thirds of a run's worth of quota — which is exactly what
 * happened the first time. Persisting per batch makes the whole pipeline
 * resumable, and a daily quota something you wait out rather than fight.
 *
 * Stops cleanly on exhaustion instead of throwing, so the caller keeps what it
 * already has.
 */
export async function embedSemantic(
  documents: string[],
  onBatch: (vectors: Vector[], startIndex: number) => Promise<void> | void,
  onProgress?: (done: number, total: number) => void,
): Promise<{ completed: number; exhausted: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const gap = (60_000 / FILMS_PER_MINUTE) * BATCH_SIZE;
  let completed = 0;
  let consecutiveFailures = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    if (completed >= DAILY_BUDGET) {
      console.log(`\n  Reached the ${DAILY_BUDGET}-film daily budget for this run.`);
      return { completed, exhausted: true };
    }

    const started = Date.now();

    try {
      const vectors = await embedBatch(documents.slice(i, i + BATCH_SIZE), apiKey);
      await onBatch(vectors, i);
      completed += vectors.length;
      consecutiveFailures = 0;
      onProgress?.(completed, documents.length);
    } catch (error) {
      // The allowance is gone. Nothing to wait for; stop and keep what we have.
      if (error instanceof QuotaExhausted) {
        console.warn(`\n  ${error.message}`);
        return { completed, exhausted: true };
      }
      if (!(error instanceof RateLimited)) throw error;

      /*
       * One failed batch is not a reason to abandon the run.
       *
       * Treating it as one meant a single transient blip on the very first
       * batch aborted a five-thousand-film job having embedded nothing. Skip
       * the batch, keep going, and only give up after several in a row.
       */
      consecutiveFailures++;
      console.warn(
        `\n  batch at ${i} failed (${consecutiveFailures} in a row): ${error.message}`,
      );

      if (consecutiveFailures >= GIVE_UP_AFTER) {
        return { completed, exhausted: true };
      }
      await sleep(15_000);
      continue;
    }

    // Self-throttle rather than waiting to be rate-limited.
    const elapsed = Date.now() - started;
    if (elapsed < gap && i + BATCH_SIZE < documents.length) await sleep(gap - elapsed);
  }

  return { completed, exhausted: false };
}
