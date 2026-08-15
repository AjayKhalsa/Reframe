import sharp from "sharp";

import { posterUrl } from "../tmdb/images";
import type { Palette } from "../types";
import { paletteFromPixels } from "./generate";

/**
 * Derives a palette from a poster, server-side.
 *
 * Used both by the seed script and by on-demand requests for films that were
 * never seeded, so a cached film and a freshly fetched one are guaranteed to
 * theme identically. Doing this in the browser instead would be cheaper but
 * would produce a visible flash of the default theme before the extraction
 * finishes — and two extraction paths that can disagree is worse than one that
 * costs a round trip.
 *
 * Node-only: `sharp` is a native module, so importing this from a client
 * component fails at build time rather than shipping something broken.
 */

/** Sampling resolution. 64px is plenty for colour and keeps the decode trivial. */
const SAMPLE_SIZE = 64;

/** Palettes are a pure function of the artwork, which never changes. */
const REVALIDATE_SECONDS = 60 * 60 * 24 * 30;

export async function paletteForPoster(
  posterPath: string | null | undefined,
): Promise<Palette | null> {
  const url = posterUrl(posterPath, "w342");
  if (!url) return null;

  // The image CDN drops connections under the parallel load the seed script
  // generates. Two extra attempts is the difference between a full cache and
  // one with holes in it.
  let bytes: ArrayBuffer | null = null;
  for (let attempt = 0; attempt < 3 && !bytes; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    try {
      const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
      if (res.ok) bytes = await res.arrayBuffer();
    } catch {
      // Network-level failure — worth another go.
    }
  }
  if (!bytes) return null;

  try {
    const { data } = await sharp(Buffer.from(bytes))
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return paletteFromPixels(data, 3);
  } catch {
    // A film that fails to decode gets the default theme. An unthemed page is
    // a perfectly acceptable outcome; a 500 is not.
    return null;
  }
}
