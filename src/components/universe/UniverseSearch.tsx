"use client";

import { useDeferredValue, useMemo, useState } from "react";

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

  // Ranking 2,000 titles per keystroke is fast but not free; deferring keeps
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
  };

  return (
    <div className="relative w-full max-w-sm">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) go(results[0].id);
        }}
      >
        <label className="sr-only" htmlFor="universe-search">
          Search the universe
        </label>
        <div className="flex items-center gap-2.5">
          <span className="text-muted text-sm" aria-hidden>
            ⌕
          </span>
          <input
            id="universe-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="Search the universe"
            autoComplete="off"
            className="text-ink placeholder:text-muted w-full bg-transparent py-2 text-sm outline-none"
          />
        </div>
        <div className="h-px" style={{ background: "var(--hairline-strong)" }} />
      </form>

      {open && results.length > 0 && (
        <ul
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden"
          style={{
            background: "rgb(var(--bg-rgb) / 0.92)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-card)",
          }}
        >
          {results.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(node.id)}
                className="hover:bg-[rgb(var(--text-rgb)/0.06)] flex w-full items-baseline justify-between gap-4 px-3.5 py-2.5 text-left transition-colors"
              >
                <span className="text-ink truncate text-sm">{node.t}</span>
                <span className="meta shrink-0">{node.y ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
