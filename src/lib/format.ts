/** Presentation helpers shared across the movie surfaces. */

/** 116 -> "1h 56m". Films under an hour keep just the minutes. */
export function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function releaseYear(releaseDate: string | null | undefined): string | null {
  if (!releaseDate) return null;
  const year = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

/**
 * The `2016 · Comedy · Crime · 1h 56m` line.
 *
 * Genres are capped because a four-genre film pushes the runtime — the part
 * people actually scan for — off the end of a phone-width line.
 */
export function metaLine(
  movie: {
    releaseDate?: string | null;
    genres?: string[];
    runtime?: number | null;
  },
  { maxGenres = 2 }: { maxGenres?: number } = {},
): string {
  return [
    releaseYear(movie.releaseDate),
    ...(movie.genres ?? []).slice(0, maxGenres),
    formatRuntime(movie.runtime),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Greeting keyed to local time. Used on the home screen. */
export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
