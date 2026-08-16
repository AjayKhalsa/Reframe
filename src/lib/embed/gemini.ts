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
import { envNumber } from "./env";

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
 * Small deliberately, and the reason is an open question worth settling.
 * `batchEmbedContents` accepts thousands of inputs per call, so if the daily
 * allowance counted *requests* the whole catalogue would be three calls and a
 * couple of minutes. Observed behaviour says otherwise: runs of twenty-film
 * batches — well under fifty HTTP requests in a day — still walked into the
 * daily wall, which only makes sense if each content in a batch is billed as
 * its own request.
 *
 * That is an inference from behaviour, not something Google documents, and it
 * is the single assumption holding the catalogue to a thousand films a day. So
 * it is overridable: one run with `GEMINI_BATCH_SIZE=200` and a raised
 * `GEMINI_DAILY_BUDGET` settles it for good. Sail past a thousand films and
 * billing is per request and this constant should be two hundred; stall at a
 * thousand and the inference was right. The cache persists per batch either
 * way, so the experiment cannot lose work.
 */
const BATCH_SIZE = envNumber("GEMINI_BATCH_SIZE", 20);

/**
 * Throttle, in films per minute.
 *
 * Measured against contents rather than HTTP requests, for the reason above.
 * Overridable so a paid key can go faster without touching the code.
 */
const FILMS_PER_MINUTE = envNumber("GEMINI_FILMS_PER_MINUTE", 80);

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
const DAILY_BUDGET = envNumber("GEMINI_DAILY_BUDGET", 950);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BatchResponse = { embeddings: Array<{ values: number[] }> };

/**
 * The longest pause worth taking inside a run.
 *
 * A per-minute limit clears in under a minute, so anything much beyond that is
 * a daily quota wearing a `retryDelay`, and sitting on it would idle the job
 * for hours to no purpose.
 */
const MAX_WAIT_MS = 5 * 60_000;

/**
 * Which kind of 429 this is.
 *
 * Two limits share one status code and want opposite responses. A per-minute
 * limit is a queue: wait the stated delay and the request succeeds. A per-day
 * limit is a wall until midnight Pacific, and retrying it spends the very
 * budget being waited for — the failure mode that once burned sixty requests
 * against a thousand-a-day cap on a single batch.
 *
 * Google distinguishes them in the error body: a `QuotaFailure` detail carries
 * a `quotaId` naming the window it belongs to, and a `RetryInfo` detail carries
 * how long to wait. Returns the delay to sleep for a transient limit, or null
 * for a daily one.
 *
 * Anything unrecognised returns null. Guessing "transient" on an unparseable
 * body reintroduces exactly the retry-storm this exists to prevent, so the
 * ambiguous case takes the conservative branch and stops.
 */
function transientRetryDelay(body: string): number | null {
  let details: Array<Record<string, unknown>>;
  try {
    details = (JSON.parse(body) as { error?: { details?: Array<Record<string, unknown>> } })
      .error?.details ?? [];
  } catch {
    return null;
  }

  const quotaIds = details
    .flatMap((detail) => (detail.violations as Array<{ quotaId?: string }> | undefined) ?? [])
    .map((violation) => violation.quotaId ?? "");

  if (quotaIds.length === 0) return null;
  // A daily violation anywhere in the list decides it, even alongside a
  // per-minute one: the day's allowance is gone regardless of the minute's.
  if (quotaIds.some((id) => /PerDay/i.test(id))) return null;
  if (!quotaIds.some((id) => /PerMinute|PerSecond/i.test(id))) return null;

  const retryInfo = details.find((detail) => typeof detail.retryDelay === "string");
  const seconds = Number(String(retryInfo?.retryDelay ?? "").replace(/s$/, ""));
  const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 60_000;

  return delay > MAX_WAIT_MS ? null : delay;
}

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
  // How long to wait before the next attempt. Set by whatever failed, because
  // only it knows: a per-minute quota states its own delay, a server fault just
  // wants escalating tens of seconds.
  let wait = 0;

  // Three, not six. The outer loop now tolerates failed batches, so this only
  // needs to ride out a brief blip — grinding through six escalating backoffs
  // per batch just made a genuinely exhausted quota take half an hour to detect.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (wait > 0) await sleep(wait);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });

      /*
       * A 429 is retried only when it is the per-minute limit.
       *
       * The daily allowance is billed per content, so a twenty-film batch
       * spends twenty of it and every retry of a rejected batch spends twenty
       * more — retrying cannot succeed and destroys the budget it is waiting
       * for. The per-minute limit is the opposite: it clears in seconds, and
       * treating it as fatal throws away the rest of a day's allowance over a
       * pause. `transientRetryDelay` reads the error body to tell them apart
       * and returns null for anything it cannot confidently call transient.
       */
      if (res.status === 429) {
        const reason = (await res.text().catch(() => "")).slice(0, 2_000);
        const delay = transientRetryDelay(reason);
        if (delay === null) {
          throw new QuotaExhausted(`Gemini quota: ${reason.replace(/\s+/g, " ").slice(0, 200)}`);
        }
        wait = delay;
        lastError = new RateLimited(`Gemini 429 (per-minute); waiting ${Math.round(delay / 1000)}s`);
        continue;
      }
      if (res.status >= 500) {
        lastError = new RateLimited(`Gemini ${res.status}`);
        wait = 20_000 * (attempt + 1);
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
      /*
       * The daily quota leaves immediately, without touching the retry budget.
       *
       * Without this the rule one comment up was defeated by its own catch: the
       * `QuotaExhausted` thrown for a spent daily allowance landed here, became
       * `lastError`, and the loop calmly re-sent the whole batch twice more
       * before rethrowing it — three requests' worth of a per-content
       * allowance spent proving the allowance was gone. The OpenAI provider
       * always had this guard; the provider the rule was written for did not.
       */
      if (error instanceof QuotaExhausted) throw error;
      lastError = error;
      // A dropped connection has no opinion about when to come back, so this
      // is the one case that still wants a plain escalating backoff.
      wait = 20_000 * (attempt + 1);
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
