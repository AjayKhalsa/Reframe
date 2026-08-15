import * as THREE from "three";

/**
 * Genre as colour.
 *
 * This is not decoration. Colour is how the map communicates cinematic
 * similarity before you have read a single word — you should be able to see
 * that one part of the universe is crime and another is science fiction, and
 * to notice where they bleed into each other, purely from the light.
 *
 * Hues are directions rather than exact values, chosen to be distinguishable
 * from each other at low saturation over black while staying cinematic. The
 * saturation and lightness here are deliberately *not* timid: an earlier pass
 * treated "subtle" as "almost invisible", and the result was a black rectangle.
 */

type Hsl = [hue: number, saturation: number, lightness: number];

const GENRE_HUES: Record<string, Hsl> = {
  Crime: [0.08, 0.62, 0.5], // deep amber / rust
  Thriller: [0.99, 0.58, 0.46], // crimson
  Mystery: [0.48, 0.5, 0.44], // teal
  Drama: [0.6, 0.42, 0.48], // slate blue
  Romance: [0.94, 0.46, 0.52], // rose
  Comedy: [0.11, 0.66, 0.55], // warm orange
  "Science Fiction": [0.52, 0.66, 0.52], // cyan
  Horror: [0.86, 0.52, 0.42], // crimson-violet
  Fantasy: [0.72, 0.5, 0.5], // indigo
  Adventure: [0.42, 0.48, 0.48], // green-teal
  Action: [0.05, 0.55, 0.48], // hot rust
  Animation: [0.14, 0.6, 0.6], // bright warm
  Documentary: [0.28, 0.3, 0.42], // muted earth green
  Music: [0.83, 0.55, 0.54], // magenta
  Family: [0.16, 0.5, 0.56],
  War: [0.1, 0.28, 0.4],
  Western: [0.07, 0.45, 0.46],
  History: [0.09, 0.34, 0.44],
  TV: [0.6, 0.3, 0.45],
};

/** Films with no recognised genre still need a colour rather than going black. */
const FALLBACK: Hsl = [0.6, 0.28, 0.46];

/**
 * A film's colour: the blend of its genres.
 *
 * Blended in linear RGB rather than by averaging hues. Averaging hue numbers
 * is what turns "crime plus mystery" — amber and teal, which should read as a
 * distinct blue-green-gold — into whatever sits at the numeric midpoint of the
 * colour wheel, usually a dead green.
 *
 * The first genre is weighted most, so a crime-thriller still reads as crime.
 */
/**
 * Deeper and more saturated than the table states.
 *
 * The auras are composited with a screen blend, which lightens and
 * desaturates as fields overlap. Feeding it the nominal colours produced a
 * milky pastel wash in exactly the dense regions that should be richest, so
 * the source colours are pushed down in lightness and up in saturation to
 * land correctly *after* blending rather than before it.
 */
function deepen([h, s, l]: Hsl): THREE.Color {
  return new THREE.Color().setHSL(h, Math.min(s * 1.35, 0.92), l * 0.82);
}

export function genreColour(genres: string[]): THREE.Color {
  if (genres.length === 0) {
    return deepen(FALLBACK);
  }

  const blended = new THREE.Color(0, 0, 0);
  let totalWeight = 0;

  genres.forEach((genre, index) => {
    const colour = deepen(GENRE_HUES[genre] ?? FALLBACK);

    // 1, 0.6, 0.36 — a clear primary with real but secondary influence.
    const weight = 0.6 ** index;
    blended.r += colour.r * weight;
    blended.g += colour.g * weight;
    blended.b += colour.b * weight;
    totalWeight += weight;
  });

  blended.multiplyScalar(1 / totalWeight);
  return blended;
}
