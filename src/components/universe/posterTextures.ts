import * as THREE from "three";

import { posterUrl, type PosterSize } from "@/lib/tmdb/images";

/**
 * Poster textures, loaded on demand and reused.
 *
 * The universe shows a bounded set of posters at any moment but the *set*
 * changes constantly as the camera moves, so textures are cached by path
 * rather than by component. Without this, flying across the map would reload
 * the same posters repeatedly and stutter every time a film re-entered view.
 *
 * Bounded by an LRU so a long session cannot accumulate the whole catalogue in
 * GPU memory — 880 textures at w185 is well over a hundred megabytes.
 */

/** Roughly two screens' worth of posters at the largest budget. */
const MAX_CACHED = 220;

type Entry = { texture: THREE.Texture; lastUsed: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<THREE.Texture | null>>();
const loader = new THREE.TextureLoader();

let clock = 0;

function evictIfNeeded() {
  if (cache.size <= MAX_CACHED) return;

  const entries = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const overflow = cache.size - MAX_CACHED;

  for (let i = 0; i < overflow; i++) {
    const [key, entry] = entries[i];
    // Textures hold GPU memory that garbage collection will not reclaim.
    entry.texture.dispose();
    cache.delete(key);
  }
}

export function loadPoster(
  path: string | null | undefined,
  size: PosterSize = "w154",
): Promise<THREE.Texture | null> {
  const url = posterUrl(path, size);
  if (!url) return Promise.resolve(null);

  const cached = cache.get(url);
  if (cached) {
    cached.lastUsed = clock++;
    return Promise.resolve(cached.texture);
  }

  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = new Promise<THREE.Texture | null>((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        // Posters are viewed head-on and never tiled; trilinear filtering with
        // mipmaps is what keeps the small ones from shimmering as they move.
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;

        cache.set(url, { texture, lastUsed: clock++ });
        inFlight.delete(url);
        evictIfNeeded();
        resolve(texture);
      },
      undefined,
      () => {
        // A missing poster is not an error worth surfacing — the film simply
        // stays a point.
        inFlight.delete(url);
        resolve(null);
      },
    );
  });

  inFlight.set(url, promise);
  return promise;
}
