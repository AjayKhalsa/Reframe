/**
 * Numeric tuning knobs read from the environment.
 *
 * The reason this is not `Number(process.env.X ?? fallback)` inline everywhere:
 * `??` only catches null and undefined, and an environment variable that is
 * *set but empty* is the empty string. `Number("")` is `0`, not `NaN`, so the
 * naive form silently substitutes zero for the default.
 *
 * That is not hypothetical. A GitHub Actions `workflow_dispatch` input left
 * blank arrives as `""`, so a batch size left at its default would become a
 * batch size of zero — a run that embeds nothing, reports nothing wrong, and
 * looks like a stalled quota.
 */
export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  // Zero and negatives are rejected rather than honoured: every knob using this
  // is a size or a rate, and none of them mean anything at or below zero.
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`  ${name}="${raw}" is not a usable number; using ${fallback}.`);
    return fallback;
  }
  return value;
}
