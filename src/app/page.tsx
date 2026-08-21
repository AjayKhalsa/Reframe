import Link from "next/link";

import { ResetView } from "@/components/universe/ResetView";
import { SelectionPanel } from "@/components/universe/SelectionPanel";
import { UniverseSearch } from "@/components/universe/UniverseSearch";
import { readUniverse } from "@/lib/universe/data";

const MAP_SECTIONS = [
  { href: "/discover", label: "Discover" },
  { href: "/taste", label: "My cinema" },
  { href: "/profile", label: "Watchlist" },
] as const;

/**
 * The universe is the homepage.
 *
 * There is almost nothing here on purpose. The canvas is rendered by the root
 * layout and fills the viewport; this page contributes only the chrome that
 * floats over it — a wordmark, a search field, and the selection panel. Any
 * more and the map stops being the product.
 */
export default async function HomePage() {
  const universe = await readUniverse();

  if (universe.nodes.length === 0) return <NotBuiltYet />;

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-3 sm:p-4 md:p-5">
      <div
        className="pointer-events-none absolute inset-3 border border-[var(--hairline)] sm:inset-4 md:inset-5"
        aria-hidden
      />

      {/* Scrims top and bottom.
          Film labels are drawn in the scene and will happily sit underneath
          the wordmark and the search field, where two pieces of light text
          overlap and neither is readable. A gradient — rather than a bar —
          darkens the ground beneath the chrome without drawing a box around
          it, so the universe still reaches the edge of the screen. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-36"
        style={{
          background:
            "linear-gradient(to bottom, rgb(var(--bg-rgb) / 0.92), rgb(var(--bg-rgb) / 0))",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
        style={{
          background:
            "linear-gradient(to top, rgb(var(--bg-rgb) / 0.85), rgb(var(--bg-rgb) / 0))",
        }}
        aria-hidden
      />

      <header className="relative grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="void-panel pointer-events-auto flex min-h-[4.25rem] items-center justify-between gap-5 px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <div className="shrink-0">
              <h1 className="font-display text-ink text-[1.35rem] leading-none tracking-[0.02em] uppercase sm:text-[1.5rem]">
                Reframe
              </h1>
              <p className="text-muted mt-1 text-[0.6875rem] tracking-[0.05em]">
                A spatial map of cinema
              </p>
            </div>

            <div className="hidden h-7 w-px bg-[var(--hairline)] sm:block" aria-hidden />
            <p className="text-muted hidden text-[0.625rem] leading-relaxed tracking-[0.12em] uppercase sm:block">
              Index 01
              <br />
              {universe.nodes.length.toLocaleString()} films
            </p>
          </div>

          <nav aria-label="Cinema sections">
            <ul className="flex items-center gap-3 sm:gap-5">
              {MAP_SECTIONS.map((section, index) => (
                <li key={section.href} className={index === 2 ? "hidden sm:block" : undefined}>
                  <Link
                    href={section.href}
                    className="text-muted hover:text-ink block py-3 text-[0.625rem] tracking-[0.12em] uppercase transition-colors"
                  >
                    {section.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="void-panel pointer-events-auto min-h-12 md:min-h-[4.25rem]">
          <UniverseSearch />
        </div>
      </header>

      {/* The panel sits right, not left or centre. The camera puts the
          selected film in the middle of the viewport, so a panel anywhere near
          the centre covers the very thing it is describing. */}
      <SelectionPanel />

      <footer className="void-panel pointer-events-auto relative flex min-h-11 items-center justify-between gap-4 px-4 sm:px-5">
        <p className="text-muted text-[0.5625rem] tracking-[0.13em] uppercase sm:hidden">
          Tap a film to focus
        </p>
        <p className="text-muted hidden text-[0.5625rem] tracking-[0.13em] uppercase sm:block">
          Drag to look <span className="text-ink/25 px-2">/</span> Scroll to travel
          <span className="text-ink/25 px-2">/</span> Click a film
        </p>

        <div className="flex items-center gap-4">
          <span className="text-muted hidden text-[0.5625rem] tracking-[0.13em] uppercase md:inline">
            {universe.source === "metadata-only" ? "Metadata projection" : "Semantic projection"}
          </span>
          <span className="hidden h-4 w-px bg-[var(--hairline)] md:block" aria-hidden />
          <ResetView />
        </div>
      </footer>
    </div>
  );
}

/**
 * Shown before the pipeline has been run.
 *
 * The universe is a build artefact, not something the app can conjure at
 * runtime, so a fresh clone needs telling rather than showing an empty void
 * that looks like a bug.
 */
function NotBuiltYet() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-ink text-[2.5rem] tracking-[0.02em] uppercase">
        Reframe
      </h1>
      <p className="text-muted mt-3 text-sm">A spatial map of cinema</p>
      <p className="text-muted mt-6 max-w-sm text-sm leading-relaxed">
        The map hasn&rsquo;t been built yet. Run the pipeline to ingest films, embed
        them and project them into space:
      </p>
      <code className="text-accent mt-5 text-sm">npm run universe</code>
    </div>
  );
}
