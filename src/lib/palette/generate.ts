/**
 * Turns a film's artwork into a usable interface palette.
 *
 * The hard requirement: whatever the poster looks like, the resulting theme
 * must stay legible. Extraction gives us the film's colours; this module
 * decides what an interface is allowed to do with them. Lightness is dictated
 * by the design system, hue is dictated by the film — that split is what keeps
 * a hundred different themes feeling like one product.
 */

import type { Palette } from "../types";
import { accentScore, extractClusters, type ColourCluster } from "./extract";
import {
  clampToGamut,
  ensureContrast,
  hexToOklch,
  hexToRgb,
  oklchToHex,
  type Oklch,
} from "./color";

/** The app's resting theme, used before a film is chosen and as the failure mode. */
export const DEFAULT_PALETTE: Palette = {
  background: "#0A0A0C",
  surface: "#17161A",
  accent: "#C9A46A",
  muted: "#8C8781",
  text: "#F3F0EA",
};

/**
 * Fixed lightness targets. Films change the hue and the chroma; they never get
 * to change how dark the interface is, because that is the product's identity.
 */
const LIGHTNESS = {
  background: 0.17,
  surface: 0.245,
  // 0.68 rather than something brighter: above ~0.72 the sRGB gamut runs out of
  // room for warm hues, and every orange film clamps to the same pastel coral.
  // Dropping the target keeps oranges orange and still clears contrast easily
  // against a background pinned at 0.17.
  accent: 0.68,
  muted: 0.68,
  text: 0.95,
} as const;

/** Ceilings on how much colour leaks into structural surfaces. Tint, not paint. */
const MAX_CHROMA = {
  background: 0.028,
  surface: 0.038,
  muted: 0.035,
  text: 0.014,
} as const;

/** Contrast floors against the generated background. Text aims well past AA. */
const CONTRAST = {
  text: 12,
  accent: 4.5,
  muted: 4.5,
} as const;

/** Below this chroma we treat the source as monochrome and go silver, not colour. */
const MONOCHROME_THRESHOLD = 0.018;

/**
 * Weighted circular mean of the clusters' hues.
 *
 * Hue wraps, so a plain average is wrong in the one case that matters most —
 * red. Crimson at 25° and 355° would average to 190°, turning a blood-red film
 * teal. Averaging the unit vectors instead handles the wrap correctly.
 */
function dominantHue(clusters: ColourCluster[]): number {
  let x = 0;
  let y = 0;

  for (const cluster of clusters) {
    // Grey pixels have no meaningful hue; letting them vote just pulls the mean
    // toward whatever rounding noise their hue happens to carry.
    const influence = cluster.weight * Math.min(cluster.oklch.c / 0.08, 1);
    if (influence <= 0) continue;
    const rad = (cluster.oklch.h * Math.PI) / 180;
    x += Math.cos(rad) * influence;
    y += Math.sin(rad) * influence;
  }

  if (x === 0 && y === 0) return 0;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Chroma of the artwork overall, used to scale how much tint the surfaces get. */
function overallChroma(clusters: ColourCluster[]): number {
  const total = clusters.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return 0;
  return clusters.reduce((sum, c) => sum + c.oklch.c * c.weight, 0) / total;
}

export function paletteFromClusters(clusters: ColourCluster[]): Palette {
  if (clusters.length === 0) return DEFAULT_PALETTE;

  // Ignore the long tail of near-empty bins — they add noise to both the hue
  // mean and the accent search without representing anything you can see.
  const significant = clusters.filter((c) => c.weight >= 0.01).slice(0, 12);
  if (significant.length === 0) return DEFAULT_PALETTE;

  const hue = dominantHue(significant);
  const chroma = overallChroma(significant);

  const background: Oklch = {
    l: LIGHTNESS.background,
    c: Math.min(chroma * 0.4, MAX_CHROMA.background),
    h: hue,
  };
  const backgroundRgb = clampToGamut(background);

  const surface: Oklch = {
    l: LIGHTNESS.surface,
    c: Math.min(chroma * 0.5, MAX_CHROMA.surface),
    h: hue,
  };

  // The accent is the one token allowed to be genuinely colourful, so it is
  // chosen on its own merits rather than inherited from the dominant hue.
  const best = significant.reduce((a, b) => (accentScore(b) > accentScore(a) ? b : a));
  const isMonochrome = best.oklch.c < MONOCHROME_THRESHOLD;

  const accent: Oklch = isMonochrome
    ? { l: 0.82, c: 0.012, h: hue }
    : {
        l: LIGHTNESS.accent,
        // Push weak accents up so they still read as a colour, but never
        // invent saturation a muted film does not have.
        c: Math.min(Math.max(best.oklch.c, 0.09), 0.17),
        h: best.oklch.h,
      };

  const muted: Oklch = {
    l: LIGHTNESS.muted,
    c: Math.min(chroma * 0.3, MAX_CHROMA.muted),
    h: hue,
  };

  const text: Oklch = {
    l: LIGHTNESS.text,
    c: Math.min(chroma * 0.15, MAX_CHROMA.text),
    h: hue,
  };

  return {
    background: oklchToHex(background),
    surface: oklchToHex(surface),
    accent: oklchToHex(ensureContrast(accent, backgroundRgb, CONTRAST.accent)),
    muted: oklchToHex(ensureContrast(muted, backgroundRgb, CONTRAST.muted)),
    text: oklchToHex(ensureContrast(text, backgroundRgb, CONTRAST.text)),
  };
}

/** Convenience wrapper for callers holding raw pixels. */
export function paletteFromPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  channels: 3 | 4 = 4,
): Palette {
  return paletteFromClusters(extractClusters(pixels, channels));
}

/**
 * The paper stock the editorial surfaces are printed on.
 *
 * Kept here rather than only in CSS because the light-safe accent has to be
 * checked for contrast against this exact value.
 */
export const PAPER = "#F4F1EA";

/** Lightness a light-surface accent aims for before contrast correction. */
const LIGHT_ACCENT_LIGHTNESS = 0.45;

/**
 * The film's accent, re-derived to sit on paper.
 *
 * The palette engine targets a dark ground throughout — accents land near L
 * 0.68, which is a fine colour on near-black and near-invisible on off-white.
 * This keeps the film's hue and chroma but walks lightness *down* until it
 * clears AA against the paper. Deriving it here rather than storing it on
 * `Palette` avoids re-seeding the whole catalogue, and it is pure and cheap.
 */
export function accentForLight(palette: Palette | null | undefined): string {
  const paperRgb = hexToRgb(PAPER);

  // No film, or a film whose artwork gave us nothing: fall back to ink rather
  // than inventing a colour.
  if (!palette) return "#14130F";

  const { h, c } = hexToOklch(palette.accent);
  const candidate: Oklch = {
    l: LIGHT_ACCENT_LIGHTNESS,
    // Darker colours can carry more chroma before leaving the gamut, so a
    // little more saturation here reads as the same colour, not a louder one.
    c: Math.min(c * 1.15, 0.19),
    h,
  };

  return oklchToHex(ensureContrast(candidate, paperRgb, 4.5, "darker"));
}

const rgbTriplet = (c: { r: number; g: number; b: number }) =>
  `${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)}`;

/**
 * A film's palette as CSS custom properties.
 *
 * Deliberately namespaced `--film-*` rather than written straight onto `--bg`
 * and friends. The surface tokens in globals.css consume these with fallbacks,
 * which is what enforces the rule that the film's colour only appears where the
 * film's image appears: a plate reads every `--film-*` value, whereas paper
 * reads only `--film-accent-light` and ignores the rest.
 *
 * Hairlines and scrims are derived in CSS, not here — the database has no
 * business knowing how translucent a divider is.
 */
export function paletteToCssVars(palette: Palette): Record<string, string> {
  return {
    "--film-bg": palette.background,
    "--film-surface": palette.surface,
    "--film-accent": palette.accent,
    "--film-muted": palette.muted,
    "--film-text": palette.text,
    "--film-accent-light": accentForLight(palette),
    // Channel triplets let CSS build translucent variants with `rgb(... / a)`
    // without re-parsing hex at every use site.
    "--film-text-rgb": rgbTriplet(hexToRgb(palette.text)),
    "--film-bg-rgb": rgbTriplet(hexToRgb(palette.background)),
  };
}
