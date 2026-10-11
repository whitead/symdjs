// Pair potentials in reduced units (ε, σ, m = 1). Each returns the energy
// u(r) and u'(r)/r so that the force on i from a neighbour at q_i + r⃗ is
// F_i += (u'(r)/r) r⃗. Truncated potentials are shifted so u(rc) = 0 and the
// force is the exact derivative of the energy (unlike symd's lj_force.c).

export type PotentialKind = "lj" | "wca" | "soft";

export interface PotentialSpec {
  kind: PotentialKind;
  epsilon: number;
  sigma: number;
  /** cutoff (ignored for WCA, which cuts at 2^(1/6) σ) */
  rc: number;
}

/** Integer codes shared with the WGSL kernels. */
export const potentialCode: Record<PotentialKind, number> = { lj: 0, wca: 1, soft: 2 };

export const defaultPotential: PotentialSpec = { kind: "lj", epsilon: 1, sigma: 1, rc: 3 };

export function cutoff(p: PotentialSpec): number {
  return p.kind === "wca" ? Math.pow(2, 1 / 6) * p.sigma : p.rc;
}

function ljRaw(r2: number, eps: number, sig: number): [number, number] {
  const x2 = (sig * sig) / r2;
  const x6 = x2 * x2 * x2;
  const x12 = x6 * x6;
  return [4 * eps * (x12 - x6), (4 * eps * (6 * x6 - 12 * x12)) / r2];
}

/** Precomputed constants for fast evaluation. */
export interface PotentialParams {
  code: number;
  eps: number;
  sig: number;
  rc: number;
  rc2: number;
  shift: number;
}

export function potentialParams(p: PotentialSpec): PotentialParams {
  const rc = cutoff(p);
  const code = potentialCode[p.kind];
  let shift = 0;
  if (code === 0 || code === 1) shift = ljRaw(rc * rc, p.epsilon, p.sigma)[0];
  return { code, eps: p.epsilon, sig: p.sigma, rc, rc2: rc * rc, shift };
}

/** Returns [u, u'/r]; caller guarantees r2 < rc2. */
export function pair(pp: PotentialParams, r2: number): [number, number] {
  if (pp.code === 2) {
    // soft cosine: u = ε (1 + cos(π r / rc)) / 2, finite at r = 0
    const r = Math.sqrt(r2);
    const k = Math.PI / pp.rc;
    const u = 0.5 * pp.eps * (1 + Math.cos(k * r));
    // u'/r = -(ε k / 2) sin(k r) / r, with the r → 0 limit -(ε k² / 2)
    const dudr_r = r > 1e-12 ? (-0.5 * pp.eps * k * Math.sin(k * r)) / r : -0.5 * pp.eps * k * k;
    return [u, dudr_r];
  }
  const [u, d] = ljRaw(r2, pp.eps, pp.sig);
  return [u - pp.shift, d];
}
