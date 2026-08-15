/**
 * Colour maths for the dynamic theme engine.
 *
 * Everything interesting happens in Oklch rather than HSL. HSL's lightness is a
 * lie — `hsl(60 100% 50%)` (yellow) and `hsl(240 100% 50%)` (blue) claim the
 * same lightness while differing by roughly 10x in perceived brightness. Since
 * the whole point of this engine is "take a film's colours and guarantee the
 * text stays readable", we need a space where lightness means something.
 */

export type Rgb = { r: number; g: number; b: number };
/** L: 0–1, C: 0–~0.4, H: degrees 0–360. */
export type Oklch = { l: number; c: number; h: number };

/* ------------------------------------------------------------------ *
 * Hex <-> RGB
 * ------------------------------------------------------------------ */

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHexPair = (v: number) =>
  Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, "0");

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}

/* ------------------------------------------------------------------ *
 * sRGB transfer function
 * ------------------------------------------------------------------ */

/** sRGB 0–255 -> linear-light 0–1. */
function toLinear(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Linear-light 0–1 -> sRGB 0–255. */
function fromLinear(v: number): number {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return s * 255;
}

/* ------------------------------------------------------------------ *
 * Oklab / Oklch — Björn Ottosson's transform
 * ------------------------------------------------------------------ */

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.hypot(okA, okB);
  // Hue is meaningless for greys; pin it to 0 so it never introduces noise.
  const hue = chroma < 1e-6 ? 0 : ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360;

  return { l: okL, c: chroma, h: hue };
}

/** Converts back to sRGB. May land outside the gamut — see `clampToGamut`. */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const bb = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * bb) ** 3;

  return {
    r: fromLinear(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: fromLinear(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: fromLinear(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  };
}

function inGamut({ r, g, b }: Rgb): boolean {
  const ok = (v: number) => v >= -0.5 && v <= 255.5;
  return ok(r) && ok(g) && ok(b);
}

/**
 * Reduces chroma until the colour fits in sRGB, preserving lightness and hue.
 *
 * Naive clipping of RGB channels shifts hue — a too-saturated orange clips to a
 * different orange. Walking chroma down keeps the colour recognisably itself,
 * which matters when the hue *is* the film's identity.
 */
export function clampToGamut(colour: Oklch): Rgb {
  const direct = oklchToRgb(colour);
  if (inGamut(direct)) return direct;

  let lo = 0;
  let hi = colour.c;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb({ ...colour, c: mid }))) lo = mid;
    else hi = mid;
  }
  return oklchToRgb({ ...colour, c: lo });
}

export const oklchToHex = (colour: Oklch): string => rgbToHex(clampToGamut(colour));

export const hexToOklch = (hex: string): Oklch => rgbToOklch(hexToRgb(hex));

/* ------------------------------------------------------------------ *
 * Contrast — WCAG 2.1
 * ------------------------------------------------------------------ */

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Nudges `colour`'s lightness until it clears `target` contrast against
 * `against`, keeping its hue and as much chroma as the gamut allows.
 *
 * `direction` says which way to move. On our dark backgrounds that is always
 * "lighter", but the parameter keeps the function honest if a light theme ever
 * lands.
 */
export function ensureContrast(
  colour: Oklch,
  against: Rgb,
  target: number,
  direction: "lighter" | "darker" = "lighter",
): Oklch {
  const step = direction === "lighter" ? 0.02 : -0.02;
  let candidate = { ...colour };

  for (let i = 0; i < 50; i++) {
    if (contrastRatio(clampToGamut(candidate), against) >= target) return candidate;
    const nextL = candidate.l + step;
    if (nextL <= 0 || nextL >= 1) break;
    candidate = { ...candidate, l: nextL };
  }

  // Ran out of lightness headroom — desaturate, which buys a little more range.
  for (let i = 0; i < 20 && candidate.c > 0; i++) {
    if (contrastRatio(clampToGamut(candidate), against) >= target) break;
    candidate = { ...candidate, c: Math.max(0, candidate.c - 0.01) };
  }
  return candidate;
}

/** `rgba()` string from a hex colour, for scrims and hairlines. */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
