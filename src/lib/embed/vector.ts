/** Small vector helpers shared by the embedders and the projection. */

export type Vector = Float64Array;

export function l2Normalise(vector: Vector): Vector {
  let sum = 0;
  for (const value of vector) sum += value * value;

  const norm = Math.sqrt(sum);
  // An all-zero vector has no direction; leaving it alone is correct, and
  // dividing by zero here would poison the whole projection with NaNs.
  if (norm === 0) return vector;

  const out = new Float64Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

/**
 * Concatenates two already-normalised vectors under a weighting.
 *
 * Both halves must be unit length before this, or whichever happens to have a
 * larger magnitude silently dominates regardless of the weights.
 */
export function blend(a: Vector, weightA: number, b: Vector, weightB: number): Vector {
  const out = new Float64Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * weightA;
  for (let i = 0; i < b.length; i++) out[a.length + i] = b[i] * weightB;
  return l2Normalise(out);
}

/** Cosine similarity of two unit vectors — for unit vectors this is just the dot product. */
export function cosine(a: Vector, b: Vector): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) sum += a[i] * b[i];
  return sum;
}
