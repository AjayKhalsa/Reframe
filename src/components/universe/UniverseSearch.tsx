"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { useUniverse } from "./UniverseProvider";

/**
 * Search, as a way of travelling rather than a results page.
 *
 * The brief is explicit that searching a film should take you there, not hand
 * you a list. So this resolves to a destination and flies the camera; the
 * dropdown exists only to disambiguate between films with similar titles.
 *
 * Runs entirely against the in-memory universe — no request, no loading state,
 * results on every keystroke.
 */

const MAX_RESULTS = 6;

export function UniverseSearch() {
  const { universe, flyTo } = useUniverse();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }

      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Ranking the catalogue per keystroke is fast but not free; deferring keeps
  // the input itself responsive while the list catches up.
  const deferred = useDeferredValue(query);

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    if (needle.length < 2) return [];

    return universe.nodes
      .map((node) => {
        const title = node.t.toLowerCase();
        if (title === needle) return { node, rank: 0 };
        if (title.startsWith(needle)) return { node, rank: 1 };
        if (title.includes(needle)) return { node, rank: 2 };
        return null;
      })
      .filter((hit): hit is { node: (typeof universe.nodes)[number]; rank: number } =>
        Boolean(hit),
      )
      // Rank first, then vote count — an exact match on an obscure film should
      // still beat a substring match on a famous one, but among equals the
      // film people mean wins.
      .sort((a, b) => a.rank - b.rank || b.node.v - a.node.v)
      .slice(0, MAX_RESULTS)
      .map((hit) => hit.node);
  }, [deferred, universe]);

  const go = (id: number) => {
    flyTo(id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative h-full w-full">
      <form
        role="search"
        className="h-full"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) go(results[0].id);
        }}
      >
        <label className="sr-only" htmlFor="universe-search">
          Search the universe
        </label>
        <div className="flex h-full min-h-12 items-center gap-3 px-4 sm:px-5">
          <svg
            viewBox="0 0 20 20"
            className="text-muted h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m12.5 12.5 4 4" />
          </svg>
          <input
            ref={inputRef}
            id="universe-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="Find a film in the universe"
            autoComplete="off"
            className="text-ink placeholder:text-muted min-w-0 flex-1 bg-transparent py-3 text-base outline-none sm:text-sm"
          />
          <span
            className="text-muted hidden shrink-0 border border-[var(--hairline)] px-2 py-1 text-[0.5625rem] tracking-[0.08em] uppercase sm:block"
            aria-hidden
          >
            Ctrl K
          </span>
        </div>
      </form>

      {open && results.length > 0 && (
        <ul
          className="void-panel absolute inset-x-0 top-full z-30 mt-2 overflow-hidden"
        >
          {results.map((node, index) => (
            <li key={node.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(node.id)}
                className="group hover:bg-[rgb(var(--text-rgb)/0.06)] flex min-h-12 w-full items-center gap-3 border-b border-[var(--hairline)] px-4 text-left transition-colors last:border-b-0"
              >
                <span className="text-muted shrink-0 text-[0.5625rem] tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-ink min-w-0 flex-1 truncate text-sm">{node.t}</span>
                <span className="meta shrink-0">{node.y ?? ""}</span>
                <span className="text-muted transition-transform group-hover:translate-x-0.5" aria-hidden>
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
