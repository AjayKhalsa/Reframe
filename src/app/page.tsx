import { ResetView } from "@/components/universe/ResetView";
import { SelectionPanel } from "@/components/universe/SelectionPanel";
import { UniverseSearch } from "@/components/universe/UniverseSearch";
import { readUniverse } from "@/lib/universe/data";

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
    <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-5 sm:p-7">
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

      <header className="pointer-events-auto relative flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-ink text-[1.5rem] leading-none tracking-[0.02em] uppercase">
            Reframe
          </h1>
          {/* The tagline earns its place on the opening screen: without it a
              first-time visitor sees a coloured field and no explanation of
              what they are looking at. */}
          <p className="text-muted mt-1.5 text-[0.8125rem]">See cinema differently.</p>
          <p className="meta mt-0.5">
            {universe.nodes.length.toLocaleString()} films
            {universe.source === "metadata-only" && " · metadata map"}
          </p>
        </div>

        <UniverseSearch />
      </header>

      {/* The panel sits right, not left or centre. The camera puts the
          selected film in the middle of the viewport, so a panel anywhere near
          the centre covers the very thing it is describing. */}
      <div className="relative flex items-end justify-between gap-6">
        <p className="text-muted/70 hidden shrink-0 text-[0.625rem] tracking-[0.14em] uppercase md:block">
          Drag to look · scroll to travel · click a film
        </p>

        <div className="ml-auto flex items-end gap-8">
          <SelectionPanel />
          <div className="hidden pb-1 md:block">
            <ResetView />
          </div>
        </div>
      </div>
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
      <p className="text-muted mt-3 text-sm">See cinema differently.</p>
      <p className="text-muted mt-6 max-w-sm text-sm leading-relaxed">
        The map hasn&rsquo;t been built yet. Run the pipeline to ingest films, embed
        them and project them into space:
      </p>
      <code className="text-accent mt-5 text-sm">npm run universe</code>
    </div>
  );
}
