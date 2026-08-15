/**
 * Contrast gate for the generated palettes.
 *
 * Run with `npm run check:contrast`.
 *
 * The palette engine was written when the product had one dark ground, so
 * every lightness target and every contrast check in it assumes text is light
 * and the background is nearly black. Introducing paper inverts that for one
 * token — the accent — and nothing in the type system would catch an accent
 * that is technically a colour but invisible on off-white.
 *
 * So this asserts, across every seeded film:
 *   - the light-safe accent clears AA against paper
 *   - the plate accent, muted and text still clear AA against the film's ground
 *
 * Exits non-zero on any failure so it can gate a build.
 */

import { accentForLight, PAPER } from "../src/lib/palette/generate";
import { contrastRatio, hexToRgb } from "../src/lib/palette/color";
import type { Movie } from "../src/lib/types";
import movies from "../src/lib/data/movies.json";

/** WCAG AA for normal-size text. */
const AA = 4.5;
/** Body text should clear far more than the minimum; this is the design target. */
const BODY_TARGET = 9;

type Failure = { title: string; check: string; ratio: number; required: number };

function main() {
  const catalogue = movies as unknown as Movie[];
  const paper = hexToRgb(PAPER);
  const failures: Failure[] = [];

  let checked = 0;
  let worstOnPaper = { title: "", ratio: Infinity };

  for (const movie of catalogue) {
    if (!movie.palette) continue;
    checked++;

    const ground = hexToRgb(movie.palette.background);

    const checks: Array<[string, number, number]> = [
      ["accent on paper", contrastRatio(hexToRgb(accentForLight(movie.palette)), paper), AA],
      ["accent on plate", contrastRatio(hexToRgb(movie.palette.accent), ground), AA],
      ["muted on plate", contrastRatio(hexToRgb(movie.palette.muted), ground), AA],
      ["text on plate", contrastRatio(hexToRgb(movie.palette.text), ground), BODY_TARGET],
    ];

    for (const [check, ratio, required] of checks) {
      if (ratio < required) failures.push({ title: movie.title, check, ratio, required });
      if (check === "accent on paper" && ratio < worstOnPaper.ratio) {
        worstOnPaper = { title: movie.title, ratio };
      }
    }
  }

  if (checked === 0) {
    console.error("No seeded palettes found. Run `npm run seed` first.");
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${checked} palettes.`);
  console.log(
    `Tightest accent-on-paper: ${worstOnPaper.title} at ${worstOnPaper.ratio.toFixed(2)}:1`,
  );

  if (failures.length === 0) {
    console.log("\nAll palettes clear their contrast floors.");
    return;
  }

  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) {
    console.error(
      `  ${failure.title.padEnd(36)} ${failure.check.padEnd(18)} ` +
        `${failure.ratio.toFixed(2)}:1 (needs ${failure.required}:1)`,
    );
  }
  process.exitCode = 1;
}

main();
