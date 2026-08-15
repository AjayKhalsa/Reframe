import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import type { Movie } from "../types";

/**
 * Detail records for every film on the map.
 *
 * Written by `npm run project` alongside the coordinates, so anything the
 * universe can navigate to is already on disk. Before this existed the app
 * knew about forty films and fetched the rest from TMDB per request, which
 * made a cold movie page take eleven seconds and — far worse — turned a
 * dropped connection into a 404 for a film that plainly exists.
 *
 * Read from disk rather than imported so a missing file degrades to "fetch it
 * from TMDB" instead of failing the build, and so several megabytes of records
 * never enter the client bundle.
 */

const FILMS_PATH = path.join(process.cwd(), "src", "lib", "data", "films.json");

const load = cache(async (): Promise<Map<number, Movie>> => {
  try {
    const films = JSON.parse(await readFile(FILMS_PATH, "utf8")) as Movie[];
    return new Map(films.map((film) => [film.tmdbId, film]));
  } catch {
    return new Map();
  }
});

export async function getMappedFilm(tmdbId: number): Promise<Movie | undefined> {
  return (await load()).get(tmdbId);
}
