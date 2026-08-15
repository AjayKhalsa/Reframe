"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether an `<img>` has decoded, for fade-in.
 *
 * `onLoad` alone is not enough. The markup is server-rendered, so the browser
 * often finishes fetching the image before React hydrates — the load event has
 * already fired by the time a handler exists, and the element stays stuck at
 * opacity 0 forever. Checking `complete` on mount closes that gap.
 *
 * Resetting on `src` change matters for the same reason in reverse: navigating
 * between films reuses the element, and without the reset the new poster would
 * be revealed before it had decoded.
 */
export function useImageLoaded(src: string | null) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!src) return;
    const image = ref.current;

    // naturalWidth guards against `complete` also being true for images that
    // failed outright — those should fall through to the placeholder.
    if (image?.complete && image.naturalWidth > 0) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
  }, [src]);

  return { ref, loaded, onLoad: () => setLoaded(true) };
}
