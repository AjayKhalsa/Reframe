"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { useUniverse } from "./UniverseProvider";

/**
 * A compact index for the selected film.
 *
 * The poster remains in the scene, while this rail gives the selection a
 * stable name and exposes the two useful next moves: open it or travel to a
 * neighbour. The pane itself ignores pointer events; only its controls capture
 * them, so films behind its empty space remain selectable.
 */
const EASE = [0.22, 0.61, 0.36, 1] as const;

export function SelectionPanel() {
  const { selectedId, byId, flyTo } = useUniverse();
  const node = selectedId === null ? null : byId.get(selectedId);

  return (
    <AnimatePresence mode="wait">
      {node && (
        <motion.aside
          key={node.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="void-panel pointer-events-none fixed inset-x-3 bottom-16 overflow-hidden text-left sm:inset-x-4 md:inset-x-auto md:right-5 md:bottom-20 md:w-[20rem]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <span className="text-accent text-[0.5625rem] tracking-[0.15em] uppercase">
                In focus
              </span>
              <h2 className="font-display text-ink mt-1 truncate text-[1.45rem] leading-none">
                {node.t}
              </h2>
            </div>
            {node.y && <span className="meta shrink-0">{node.y}</span>}
          </div>

          <Link
            href={`/movie/${node.id}`}
            className="text-ink hover:bg-[rgb(var(--text-rgb)/0.06)] pointer-events-auto flex min-h-12 items-center justify-between border-b border-[var(--hairline)] px-4 text-[0.6875rem] tracking-[0.14em] uppercase transition-colors"
          >
            <span>Open film</span>
            <span className="text-accent" aria-hidden>↗</span>
          </Link>

          {node.n.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                <span className="text-muted text-[0.5625rem] tracking-[0.14em] uppercase">
                  Nearby in the map
                </span>
                <span className="text-muted/60 text-[0.5625rem]">
                  {String(Math.min(node.n.length, 4)).padStart(2, "0")}
                </span>
              </div>
              <ul>
                {node.n.slice(0, 4).map((id, index) => {
                  const neighbour = byId.get(id);
                  if (!neighbour) return null;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => flyTo(id)}
                        className="text-muted hover:text-ink hover:bg-[rgb(var(--text-rgb)/0.05)] pointer-events-auto flex min-h-9 w-full items-center gap-3 px-4 text-left text-[0.75rem] transition-colors"
                      >
                        <span className="text-muted/50 shrink-0 text-[0.5625rem] tabular-nums">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{neighbour.t}</span>
                        <span className="text-muted/50" aria-hidden>→</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="text-muted/60 border-t border-[var(--hairline)] px-4 py-2.5 text-[0.5625rem] tracking-[0.08em] uppercase">
            Tap any other film to change focus
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
