"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { useUniverse } from "./UniverseProvider";

/**
 * What is selected, as type rather than as a card.
 *
 * The previous version was a bordered, blurred, rounded rectangle with a
 * poster in it — a conventional website component sitting on top of a
 * visualisation, competing with it. This is the same information set as
 * unadorned text against the scrim: no border, no panel background, no box.
 *
 * It can afford to be this light because the poster and the title are now in
 * the scene, attached to the film itself. The composition happens in the
 * universe; this is only the set of actions that go with it.
 *
 * It deliberately does not repeat the title. On a narrow viewport the repeated
 * title collided with the in-scene one, which was the clearest possible sign
 * it was redundant at every width.
 *
 * Bottom sheet on mobile, right rail on desktop.
 */
const EASE = [0.22, 0.61, 0.36, 1] as const;

export function SelectionPanel() {
  const { selectedId, byId, flyTo, select } = useUniverse();
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
          className="pointer-events-auto fixed inset-x-5 bottom-24 text-left md:static md:inset-auto md:w-[15rem] md:text-right"
        >
          {/* A ground for the sheet, on mobile only.
              On a phone the panel sits over the middle of the map rather than
              beside it, so without this its text competes with the film labels
              behind it. A gradient rather than a filled card — the sheet should
              feel like the universe darkening under it, not a box on top. */}
          <div
            className="pointer-events-none absolute -inset-x-5 -bottom-24 -top-8 -z-10 md:hidden"
            style={{
              background:
                "linear-gradient(to top, rgb(var(--bg-rgb)) 30%, rgb(var(--bg-rgb) / 0.85) 60%, rgb(var(--bg-rgb) / 0))",
            }}
            aria-hidden
          />
          <Link
            href={`/movie/${node.id}`}
            className="text-accent inline-block text-[0.6875rem] tracking-[0.16em] uppercase transition-opacity hover:opacity-70"
          >
            Enter film →
          </Link>

          {node.n.length > 0 && (
            <div className="mt-5">
              <span className="eyebrow">Nearby</span>
              <ul className="mt-2 flex flex-col gap-1">
                {node.n.slice(0, 4).map((id) => {
                  const neighbour = byId.get(id);
                  if (!neighbour) return null;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => flyTo(id)}
                        // Alignment has to follow the panel's own responsive
                        // switch, or the headings sit left while the list sits
                        // right.
                        className="text-muted hover:text-ink w-full truncate text-left text-[0.8125rem] transition-colors md:text-right"
                      >
                        {neighbour.t}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => select(null)}
            className="text-muted/60 hover:text-ink mt-5 text-[0.5625rem] tracking-[0.16em] uppercase transition-colors"
          >
            Dismiss
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
