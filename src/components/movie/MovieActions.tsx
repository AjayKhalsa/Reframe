"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { RatingValue } from "@/lib/types";

/**
 * Watchlist / seen / rate.
 *
 * State is local to the component. Phase 3 replaces `useState` here with a
 * server action against the `ratings` and `watchlists` tables — the markup and
 * the interaction should not need to change, only where the value lives.
 */
export function MovieActions({
  initialOnWatchlist = false,
  initialRating = null,
}: {
  initialOnWatchlist?: boolean;
  initialRating?: RatingValue | null;
}) {
  const [onWatchlist, setOnWatchlist] = useState(initialOnWatchlist);
  const [rating, setRating] = useState<RatingValue | null>(initialRating);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <ActionButton active={onWatchlist} onClick={() => setOnWatchlist((v) => !v)}>
          {onWatchlist ? "On your watchlist" : "Add to watchlist"}
        </ActionButton>
      </div>

      <div>
        <span className="eyebrow">{rating ? "You rated this" : "Seen it? Rate it"}</span>
        <Stars value={rating} onChange={setRating} />
      </div>
    </div>
  );
}

function ActionButton({
  active,
  children,
  ...props
}: { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center px-5",
        "text-[0.8125rem] font-medium tracking-[0.14em] uppercase",
        "border transition-all duration-200",
        active
          ? "bg-accent text-bg border-transparent"
          : "text-ink hover:bg-[rgb(var(--text-rgb)/0.06)] border-[var(--hairline-strong)]",
      )}
      style={{ borderRadius: "var(--radius-pill)", transitionTimingFunction: "var(--ease)" }}
    >
      {children}
    </button>
  );
}

/**
 * Five stars.
 *
 * Radio semantics rather than buttons, because that is what this is: one choice
 * from five. Screen readers get a labelled group; everyone else gets targets
 * comfortably above the 44px thumb minimum.
 */
function Stars({
  value,
  onChange,
}: {
  value: RatingValue | null;
  onChange: (value: RatingValue) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      className="mt-2 flex gap-1"
      onMouseLeave={() => setHovered(null)}
    >
      {([1, 2, 3, 4, 5] as const).map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          onMouseEnter={() => setHovered(star)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(null)}
          onClick={() => onChange(star)}
          className="grid h-11 w-11 place-items-center transition-transform duration-150 hover:scale-110"
          style={{ transitionTimingFunction: "var(--ease)" }}
        >
          <Star filled={star <= shown} />
        </button>
      ))}
    </div>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 transition-colors duration-150"
      fill={filled ? "var(--accent)" : "none"}
      stroke={filled ? "var(--accent)" : "var(--muted)"}
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-2.9-5.3 2.9 1.1-6.1L3.4 9.9l6-.8z" />
    </svg>
  );
}
