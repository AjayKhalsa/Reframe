"use client";

import Link from "next/link";

/**
 * When a film cannot be loaded.
 *
 * Distinct from the not-found page on purpose. "This film does not exist" and
 * "we could not reach TMDB just now" are different facts, and showing the
 * first when the second is true tells the reader to give up on something that
 * would work if they tried again. This one offers the retry.
 */
export default function MovieError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-ink text-[2rem] text-balance">
        That film wouldn&rsquo;t load.
      </h1>
      <p className="text-muted mt-4 max-w-sm text-sm leading-relaxed">
        The film database didn&rsquo;t answer. It&rsquo;s almost certainly still
        there — this usually clears immediately.
      </p>

      <div className="mt-8 flex items-center gap-7">
        <button
          type="button"
          onClick={reset}
          className="text-accent text-[0.6875rem] tracking-[0.16em] uppercase transition-opacity hover:opacity-70"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-muted hover:text-ink text-[0.6875rem] tracking-[0.16em] uppercase transition-colors"
        >
          ← Back to the map
        </Link>
      </div>
    </div>
  );
}
