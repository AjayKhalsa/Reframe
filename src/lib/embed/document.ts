/**
 * The text a film is embedded from.
 *
 * Shared by both embedders so the semantic and metadata halves are always
 * describing the same thing, and so a change to what counts as "the film"
 * happens in one place.
 */

import type { Movie } from "../types";

/** Cast beyond the top billing is noise — a fourth-billed actor says nothing about a film. */
const CAST_DEPTH = 6;
/** Keywords are long-tailed; past this they are trivia rather than description. */
const KEYWORD_DEPTH = 18;

/**
 * TMDB keywords describing the artefact rather than the film, plus settings.
 *
 * Shared geography is a coincidence, not a similarity — without this the map
 * grows a "films set in Los Angeles" region that cuts across every genre and
 * theme, which is exactly the kind of false neighbourhood that makes a
 * semantic map untrustworthy.
 */
function isUsefulKeyword(keyword: string): boolean {
  const k = keyword.toLowerCase().trim();
  if (k.length < 3) return false;
  if (k.includes(",")) return false; // "los angeles, california"
  if (/^(19|20)\d0s$/.test(k)) return false;
  return ![
    "duringcreditsstinger",
    "aftercreditsstinger",
    "based on novel or book",
    "based on true story",
    "based on comic",
    "woman director",
    "independent film",
    "sequel",
    "prequel",
    "remake",
    "imax",
    "3d",
  ].includes(k);
}

export function keywordsFor(movie: Movie): string[] {
  return movie.keywords.filter(isUsefulKeyword).slice(0, KEYWORD_DEPTH);
}

export function castFor(movie: Movie): string[] {
  return movie.cast.slice(0, CAST_DEPTH).map((member) => member.name);
}

/**
 * A film as prose, for a text embedding model — **story only**.
 *
 * Written as sentences rather than a field dump because embedding models are
 * trained on language: "a weatherman relives the same day" embeds far more
 * usefully than "comedy|fantasy|time loop".
 *
 * Genre, director and cast are deliberately absent. They used to be here, and
 * that was the flaw: naming them in the prose baked genre and casting into the
 * one vector whose entire job is to capture *what happens*, so two unrelated
 * films could be pulled together for sharing a lead actor. Those signals are
 * not lost — they are the metadata half's responsibility, weighted separately
 * and deliberately at comparison time.
 *
 * What is left is premise, tone and theme: the things that put Groundhog Day
 * next to Palm Springs despite them sharing no genre at all.
 */
export function semanticDocument(movie: Movie): string {
  const year = movie.releaseDate?.slice(0, 4);
  const parts: string[] = [];

  // Title and year stay: they carry sequels and adaptations, which are
  // genuine story relationships rather than incidental metadata.
  parts.push(`${movie.title}${year ? ` (${year})` : ""}.`);

  if (movie.tagline) parts.push(movie.tagline);
  if (movie.overview) parts.push(movie.overview);

  const keywords = keywordsFor(movie);
  if (keywords.length) parts.push(`Themes: ${keywords.join(", ")}.`);

  return parts.join(" ");
}

/**
 * A film as discrete tokens, for the metadata embedder.
 *
 * Namespaced so a director and an actor of the same name never collide, and so
 * each family can be weighted independently.
 */
export function metadataTokens(movie: Movie): string[] {
  const tokens: string[] = [];

  for (const genre of movie.genres) tokens.push(`g:${genre.toLowerCase()}`);
  for (const keyword of keywordsFor(movie)) tokens.push(`k:${keyword.toLowerCase()}`);
  if (movie.director) tokens.push(`d:${movie.director.toLowerCase()}`);
  for (const name of castFor(movie)) tokens.push(`c:${name.toLowerCase()}`);
  tokens.push(`l:${movie.originalLanguage}`);

  const year = Number.parseInt(movie.releaseDate?.slice(0, 4) ?? "", 10);
  if (Number.isFinite(year)) tokens.push(`e:${Math.floor(year / 10) * 10}s`);

  return tokens;
}

/** Stable identity for a film's embeddable content, so caches invalidate correctly. */
export function contentHash(movie: Movie): string {
  const source = `${semanticDocument(movie)}||${metadataTokens(movie).join("|")}`;
  // FNV-1a: not cryptographic, just needs to change when the content does.
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
