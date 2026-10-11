// Affine operations in homogeneous coordinates: a (D+1)×(D+1) row-major
// matrix whose last row is (0,…,0,1). Ops act on column vectors s' = R s + t.

import { inverse, matMul } from "./linalg";

export interface Affine {
  D: number;
  /** (D+1)² row-major homogeneous matrix */
  m: Float64Array;
}

export function affineIdentity(D: number): Affine {
  const m = new Float64Array((D + 1) * (D + 1));
  for (let i = 0; i <= D; i++) m[i * (D + 1) + i] = 1;
  return { D, m };
}

export function affineFrom(D: number, R: ArrayLike<number>, t: ArrayLike<number>): Affine {
  const a = affineIdentity(D);
  const n = D + 1;
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) a.m[i * n + j] = R[i * D + j];
    a.m[i * n + D] = t[i];
  }
  return a;
}

export function linearPart(a: Affine): Float64Array {
  const { D, m } = a;
  const R = new Float64Array(D * D);
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) R[i * D + j] = m[i * (D + 1) + j];
  return R;
}

export function translationPart(a: Affine): Float64Array {
  const { D, m } = a;
  const t = new Float64Array(D);
  for (let i = 0; i < D; i++) t[i] = m[i * (D + 1) + D];
  return t;
}

/** out = a · s (s has D components). */
export function applyAffine(a: Affine, s: ArrayLike<number>, out?: Float64Array): Float64Array {
  const { D, m } = a;
  const n = D + 1;
  const r = out ?? new Float64Array(D);
  for (let i = 0; i < D; i++) {
    let acc = m[i * n + D];
    for (let j = 0; j < D; j++) acc += m[i * n + j] * s[j];
    r[i] = acc;
  }
  return r;
}

/** a ∘ b (apply b first). */
export function compose(a: Affine, b: Affine): Affine {
  return { D: a.D, m: matMul(a.m, b.m, a.D + 1, a.D + 1, a.D + 1) };
}

export function affineInverse(a: Affine): Affine {
  return { D: a.D, m: inverse(a.m, a.D + 1) };
}

export function wrap01(x: number): number {
  const w = x - Math.floor(x);
  return w >= 1 ? 0 : w;
}

/** Reduce the translation part into [0, 1). */
export function reduceMod1(a: Affine): Affine {
  const r = { D: a.D, m: Float64Array.from(a.m) };
  const n = a.D + 1;
  for (let i = 0; i < a.D; i++) r.m[i * n + a.D] = wrap01(r.m[i * n + a.D]);
  return r;
}

/** Equality of two ops modulo integer lattice translations. */
export function equalMod1(a: Affine, b: Affine, tol = 1e-8): boolean {
  const n = a.D + 1;
  for (let i = 0; i < a.D; i++) {
    for (let j = 0; j < a.D; j++) if (Math.abs(a.m[i * n + j] - b.m[i * n + j]) > tol) return false;
    const dt = a.m[i * n + a.D] - b.m[i * n + a.D];
    if (Math.abs(dt - Math.round(dt)) > tol) return false;
  }
  return true;
}

export function isIdentityLinear(a: Affine, tol = 1e-12): boolean {
  const n = a.D + 1;
  for (let i = 0; i < a.D; i++)
    for (let j = 0; j < a.D; j++) if (Math.abs(a.m[i * n + j] - (i === j ? 1 : 0)) > tol) return false;
  return true;
}

/** Distance between two fractional points on the unit torus (Euclidean in fractional units). */
export function torusDistance(a: ArrayLike<number>, b: ArrayLike<number>, D: number): number {
  let s = 0;
  for (let i = 0; i < D; i++) {
    let d = a[i] - b[i];
    d -= Math.round(d);
    s += d * d;
  }
  return Math.sqrt(s);
}
