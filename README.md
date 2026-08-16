# Reframe

**A spatial map of cinema**

A visual map of cinema where similar films live near each other. You find
things by moving through it rather than by searching a database.

Not a recommendation app with a graph on the homepage. **The map is the
homepage** — it is the navigation and the discovery mechanism, and movie pages,
search and taste all hang off it.

## Running it

```bash
npm install
```

Copy `.env.example` to `.env.local` and add:

- `TMDB_READ_TOKEN` — free at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
- `GEMINI_API_KEY` — free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Then build the universe and start:

```bash
npm run universe
npm run dev
```

The app will tell you to run the pipeline if the map is missing — it is a build
artefact, not something generated at runtime.

## The pipeline

```
TMDB ──▶ catalogue ──▶ embeddings ──▶ UMAP ──▶ x/y/z + neighbours
```

| Script | |
| --- | --- |
| `npm run ingest` | Crawl ~2,000 films. Resumable. |
| `npm run embed` | Hybrid embeddings. Cached, resumable. |
| `npm run project` | UMAP to 3D + nearest neighbours + clusters. |
| `npm run universe` | All three in order. |
| `npm run inspect` | **Is the map any good?** See below. |

All three are offline. Nothing embeds or projects at request time.

Every stage is resumable and checkpoints as it goes, which is not defensive
programming — TMDB drops roughly a quarter of connections from a cold pool, and
the Gemini free tier has a daily ceiling. Both runs are *expected* to stop
partway and be re-run.

### Is the map any good?

`npm run inspect` prints the neighbourhoods of a few probe films. This is the
real test, and it is worth running before building anything on top of a new map:

- **Good** — The Social Network sits near Moneyball, Steve Jobs, Whiplash.
  Different genres, shared preoccupations: ambition, obsession, competition.
- **Bad** — The Social Network sits near other 2010s dramas. The embedding has
  rebuilt the genre taxonomy and no amount of rendering will rescue it.

## Embeddings

Two halves, blended 75/25 and L2-normalised:

- **Semantic** (Gemini, 768d) reads the film as prose. This is what finds
  thematic relationships, because they live in the overview and nowhere in the
  metadata.
- **Metadata** (local TF-IDF → random projection, 128d) knows categorical facts
  — shared director above all — that text embeddings systematically underweight.

Neither alone works. Semantic-only misses that two films share a director;
metadata-only just redraws the genre chart.

Semantic vectors are cached by content hash in `data/semantic-cache.json`, so
re-running costs nothing and the free tier is ample. The metadata half is
recomputed every run because TF-IDF weights depend on the whole corpus.

## Deploying

The map is a **build artefact**, not something generated at runtime:
`src/lib/data/universe.json` is committed and read at build time. So a deploy
ships whatever map was last projected — run `npm run project` and commit before
deploying if you want the newest one.

Vercel, from the GitHub repo:

```bash
npx vercel --prod
```

Only one environment variable is needed on the server:

| Variable | Why |
| --- | --- |
| `TMDB_READ_TOKEN` | Search, and fetching films that aren't in the local cache |

`GEMINI_API_KEY` and `OPENAI_API_KEY` are **not** needed in production. They are
used exclusively by the offline pipeline; nothing embeds at request time.

Note that `/data` is gitignored — the raw catalogue and embedding caches stay
local. Only the projected map ships. The gitignore pattern is `/data/` with a
leading slash on purpose: without it, it also matches `src/lib/data/`, which is
where the map lives, and the deployed app would have an empty universe.

## Keeping the map current

`.github/workflows/daily-map.yml` runs the whole pipeline once a day, commits
`src/lib/data/` if anything changed, and lets the push trigger a Vercel deploy.
It exists because the free embedding tier has a daily ceiling — a full
catalogue is not one long run, it is a run a day for as many days as it takes.

It needs `TMDB_READ_TOKEN` and `GEMINI_API_KEY` as **repository secrets**
(Settings → Secrets and variables → Actions), which is a different place from
Vercel's environment variables. The workflow writes them to `.env.local` on the
runner, because that is what the scripts already read.

Two things about it are load-bearing:

**The cache is the valuable part.** `data/` is gitignored and therefore absent
on a fresh runner, so the embedding cache is carried between runs by
`actions/cache`. Every vector in it is a slice of an allowance that cannot be
bought back — losing it means re-embedding at a thousand films a day.

**A lost cache must not shrink the live map.** If the cache is evicted, the
embedder starts from nothing, gets one day's films, and projects a completely
valid universe of a few hundred over the thousands already shipped. `project`
therefore refuses to publish a map materially smaller than the committed one
(`ALLOW_SHRINK=1` overrides, for the rare run where that is the intention).

**One provider per map.** The workflow deliberately does not receive
`OPENAI_API_KEY`. Splitting a catalogue across two embedding providers to get
two free allowances does not work: vectors from different models occupy
unrelated spaces, and the cosine similarity between a Gemini vector and an
OpenAI one is not slightly wrong, it is meaningless. Every film on one map must
come from the same model, so changing provider means re-embedding all of them —
a deliberate act, not something a nightly job should drift into.

## Architecture notes

- **The canvas lives in the root layout, not the page.** This is the most
  important structural decision here. A canvas inside the home page would be
  torn down on every navigation — destroying the WebGL context, reloading
  textures, resetting the camera. Films render as an overlay *above* it, so
  returning from one is just the overlay leaving. That is what makes the
  universe a place rather than a screen.
- **Camera state lives in a ref in `UniverseProvider`**, above the router.
  Sixty updates a second through React state would re-render the tree for a
  value nothing renders.
- **Coordinates and neighbours are different things.** Coordinates come from
  UMAP and are a lossy picture. Neighbours are computed in the full embedding
  space. Reading neighbours off the 3D positions would be cheaper and quietly
  wrong — UMAP distorts distance, so films that merely landed near each other
  would be presented as related.
- **Two surfaces, one token set.** `void` is the universe: fixed charcoal, no
  film colour ever. `plate` is a single film, tinted by its own artwork. Both
  define the same CSS variables, so components work on either without changes.
- **`<img>`, not `next/image`.** TMDB serves pre-sized derivatives from its own
  CDN. The lint rule is off centrally, with the reason, in `eslint.config.mjs`.

## State of things

Built: the pipeline end to end, the 3D universe with level-of-detail rendering,
search-as-travel, selection and neighbourhoods, the cinematic movie page, and
the enter/return loop.

Not built: Letterboxd import, My Cinema, taste territory, blind spots,
pathfinding between films, comparison mode, 2D fallback, and anything social.
`src/lib/mock/session.ts` stands in for a signed-in user and is the single file
to delete when accounts land.
