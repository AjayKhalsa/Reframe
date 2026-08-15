import * as THREE from "three";

/**
 * A soft radial sprite, generated once and shared.
 *
 * Everything atmospheric in the universe is built from this: a white blob that
 * falls off to nothing. Additively blended and stacked at low opacity, a few
 * dozen of them read as volume — which is far cheaper than volumetric
 * rendering and, at these opacities, indistinguishable.
 *
 * The falloff is quartic rather than linear. A linear gradient has a visible
 * edge where it reaches zero, and a hundred visible circular edges is exactly
 * the "bubbles on a scatterplot" look we are trying to get away from.
 */
let cached: THREE.Texture | null = null;

export function softSprite(): THREE.Texture {
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  const image = ctx.createImageData(size, size);
  const centre = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Quartic falloff, clipped at the circle's edge.
      const falloff = Math.max(0, 1 - distance);
      const alpha = falloff * falloff * falloff * falloff;

      const index = (y * size + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(image, 0, 0);

  cached = new THREE.CanvasTexture(canvas);
  cached.needsUpdate = true;
  return cached;
}
