/**
 * Dominant-colour extraction from artwork.
 *
 * Runs on raw pixels so the same code serves both callers: the seed script
 * (which decodes posters with sharp) and the browser (which decodes them with a
 * canvas). Neither environment is assumed here.
 */

import { rgbToOklch, rgbToHex, type Oklch, type Rgb } from "./color";

export type ColourCluster = {
  rgb: Rgb;
  oklch: Oklch;
  hex: string;
  /** Share of sampled pixels in this cluster, 0–1. */
  weight: number;
};

/**
 * Bin widths for quantisation, in Oklch units.
 *
 * Hue is the finest because it carries a film's identity — Dune's sand and The
 * Matrix's green must never collapse into one bin. Lightness is coarsest
 * because we re-derive it later anyway.
 */
const HUE_BIN_DEGREES = 20;
const CHROMA_BIN = 0.04;
const LIGHTNESS_BIN = 0.12;

/** Below this chroma a colour is grey, and all greys belong in one bin regardless of hue. */
const GREY_CHROMA = 0.02;

type Accumulator = { r: number; g: number; b: number; count: number };

/**
 * Groups pixels into perceptual clusters, heaviest first.
 *
 * @param pixels RGB or RGBA bytes.
 * @param channels 3 for RGB, 4 for RGBA.
 */
export function extractClusters(
  pixels: Uint8Array | Uint8ClampedArray,
  channels: 3 | 4 = 4,
): ColourCluster[] {
  const bins = new Map<string, Accumulator>();
  let sampled = 0;

  for (let i = 0; i < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] < 128) continue; // effectively transparent

    const rgb = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
    const { l, c, h } = rgbToOklch(rgb);

    // Letterboxing and title cards flood posters with pure black and pure
    // white. Both are useless as palette seeds and would otherwise dominate.
    if (l < 0.06 || l > 0.97) continue;

    const key =
      c < GREY_CHROMA
        ? `grey:${Math.round(l / LIGHTNESS_BIN)}`
        : [
            Math.round(l / LIGHTNESS_BIN),
            Math.round(c / CHROMA_BIN),
            Math.round(h / HUE_BIN_DEGREES) % Math.round(360 / HUE_BIN_DEGREES),
          ].join(":");

    const bin = bins.get(key);
    if (bin) {
      bin.r += rgb.r;
      bin.g += rgb.g;
      bin.b += rgb.b;
      bin.count++;
    } else {
      bins.set(key, { r: rgb.r, g: rgb.g, b: rgb.b, count: 1 });
    }
    sampled++;
  }

  if (sampled === 0) return [];

  return [...bins.values()]
    .map((bin) => {
      const rgb = { r: bin.r / bin.count, g: bin.g / bin.count, b: bin.b / bin.count };
      return {
        rgb,
        oklch: rgbToOklch(rgb),
        hex: rgbToHex(rgb),
        weight: bin.count / sampled,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * How suitable a cluster is as the theme's accent.
 *
 * Prefers colours that are chromatic (an accent must read as a colour), mid-to-
 * bright (it sits on a dark ground), and actually present in the artwork. The
 * weight term is deliberately dampened with a square root: the single largest
 * region of a poster is usually a muted background wash, and taking it at face
 * value produces beige themes for films that are anything but.
 */
export function accentScore(cluster: ColourCluster): number {
  const { l, c } = cluster.oklch;

  // Chroma saturates around 0.15 — past that, more colour is not more useful.
  const chromaScore = Math.min(c / 0.15, 1);

  // Peaks near L 0.65: bright enough to carry contrast, not so bright it glares.
  const lightnessScore = 1 - Math.abs(l - 0.65) / 0.65;

  const presenceScore = Math.sqrt(cluster.weight);

  return chromaScore * 1.6 + Math.max(0, lightnessScore) * 0.9 + presenceScore * 1.0;
}

