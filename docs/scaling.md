# Scaling Reframe

What breaks, at what size, and in what order. Written after measuring the
current payload rather than estimating it.

## The shape of the problem

Reframe is an offline pipeline that commits a build artefact, and an app that
ships that artefact to a browser. Both halves scale differently, and the
browser half binds first.

Measured over the 900-film map:

| | per film | at 6,028 | at 25,000 | at 100,000 |
| --- | --- | --- | --- | --- |
| `universe.json` — **sent to every browser** | 219 B | 1.3 MB | 5.4 MB | 21 MB |
| `films.json` — server-side only | 2,174 B | 13 MB | 54 MB | 217 MB |
| kNN build, O(n²) | — | ~4 min | ~70 min | ~18 h |

## What breaks, in order

**1. The client payload, around 25,000 films.** `universe.json` loads in the
root layout, so it blocks every route, not just the map. 5 MB is already a poor
first paint on mobile; 21 MB is not a website.

Of the 219 bytes per node, **27% is the neighbour list** — ten TMDB ids per
film. Another 16% is poster paths and 14% genre names.

The neighbour list is the interesting quarter, but not for the obvious reason.
The map does use it: `Labels` pins the selected film's five nearest so its
neighbourhood is legible, `SelectionPanel` lists four, and `NearbyFilms` shows
ten on a film's page. What none of them do is use *more than one film's
neighbours at a time*. The payload ships n×10 ids to serve a lookup that is
only ever performed against the one film the viewer has selected.

So the saving is real but it is not a deletion — it is fetching a film's
neighbours when it is selected. That carries a cost this codebase has
deliberately paid before: `ReturnControls` exists so a returning viewer's
neighbourhood is *already lit* rather than appearing a beat later, and moving
neighbours behind a request reintroduces exactly that beat. Prefetching on
hover, or shipping neighbours only for the few hundred highest-vote films that
are plausible first selections, both avoid it.

Encoding coordinates as typed arrays rather than JSON decimals is the part with
no tradeoff at all.

**2. `films.json`, around 25,000 films.** It is server-only, which sounds safe,
but Next bundles it into the serverless function — 54 MB of JSON parsed on cold
start, and past that, function size limits. This is where a real datastore stops
being optional.

**3. Nearest neighbours, around 25,000 films.** Exact kNN is O(n²) and already
costs minutes at 6,028. It is a solved problem — an HNSW index builds in seconds
at these sizes — but it has to be built in the *embedding* space, never on the
3D projection, for the reason the README already gives.

**4. The git-artefact deploy model, around 25,000 films.** Committing the map
and letting the push trigger a deploy is an excellent fit at 6,000 films and
absurd at 100,000: every run rewrites a multi-megabyte file, and a daily job
means a new copy of it in history every day.

**5. Rendering, past ~50,000.** Points are cheap and already instanced. The aura
layer is not — it is fill-rate bound, and every film emits a field. It needs
density-based culling, or auras become a property of neighbourhoods rather than
of individual films.

## Phases

**Phase 0 — finish what exists (6,028 films).** No structural change needed,
and none worth making. Nothing on this list binds at 1.3 MB. Spending the
interaction latency described above to save a megabyte nobody is waiting on
would be paying a real cost for a hypothetical one.

**Phase 1 — to ~25,000 films.** Coordinates as typed arrays first, since that
one is free. Then neighbours on demand, with prefetching to cover the beat. `films.json` becomes SQLite/Turso or per-film
static records. HNSW replaces exact kNN. The pipeline still commits a slim
binary artefact, which still deploys on push.

**Phase 2 — beyond that.** The map streams by region instead of loading whole:
an octree over the projection, tiles fetched as the camera moves. Projection
moves off `umap-js`. The pipeline writes to a database rather than to git, and
the deploy stops being coupled to the data.

## The question worth asking before any of it

Does a bigger map make a better one?

Ingestion already filters at 80 votes and stratifies by era and language,
because a popularity-ordered crawl produces a decade of blockbusters and a map
with nothing in it. That logic does not stop applying at 6,028. Films at the
threshold have two-line overviews, and a two-line overview embeds badly — it
lands in whatever region the model uses for "not much information", which is a
false neighbourhood exactly like the "films set in Los Angeles" cluster the
keyword filter exists to prevent.

So growth plausibly *lowers* map quality while raising every cost on this page.

That is measurable, and cheaply: `npm run evaluate` gives recall@20 at 900
films today. Run it again at 6,028. If recall falls, the catalogue has an
optimal size and finding it is worth more than any engineering here. If it
holds or rises, scale with confidence. Either answer is worth having before
committing to Phase 1.
