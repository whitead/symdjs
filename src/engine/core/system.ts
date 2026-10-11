// A symmetric system: which group, how many asymmetric-unit particles
// ("reps") sit on each Wyckoff site, and the compiled data both engines use.
//
// Every rep is treated as living on a site manifold s = t + L u. The general
// position is the special case t = 0, L = I, so the integrator, constraint
// projection and NPT Jacobian are uniform across reps.

import { applyAffine, linearPart, wrap01 } from "../math/affine";
import { det, inverse, matMul, transpose } from "../math/linalg";
import { Rng } from "../math/rng";
import { boxFromParams, paramsForVolume } from "../groups/bravais";
import type { Group, WyckoffSite } from "../groups/group";
import { insideHalfSpaces } from "../groups/notation";
import { defaultPotential, type PotentialSpec } from "./potentials";

export interface SimParams {
  /** true temperature of the crystal */
  T: number;
  /** pressure; null = constant volume */
  P: number | null;
  /** Langevin friction (0 = NVE) */
  gamma: number;
  dt: number;
  potential: PotentialSpec;
  /** cap on |F| per rep (Infinity = off) */
  forceCap: number;
  /** attempt a box move every this many steps */
  nptEvery: number;
  /** adapt the box-move step size toward 20–50% acceptance (breaks detailed balance slightly) */
  mcAdapt: boolean;
}

export interface SystemSpec {
  group: Group;
  /** reps per site letter, e.g. { d: 3, a: 1 } */
  occupancy: Record<string, number>;
  /** initial number density N_cell / V */
  density: number;
  seed: number;
  params?: Partial<SimParams>;
}

export const defaultParams: SimParams = {
  T: 0.5,
  P: null,
  gamma: 1,
  dt: 0.005,
  potential: defaultPotential,
  forceCap: Infinity,
  nptEvery: 4,
  mcAdapt: true,
};

/** Static description shared by CPU and GPU engines. */
export interface SystemData {
  D: number;
  group: Group;
  /** number of reps */
  n: number;
  /** number of particles per unit cell */
  nCell: number;
  /** site index (into group.sites) per rep */
  siteOf: Int32Array;
  /** orbit size per rep (= its mass in units of m) */
  orbit: Float64Array;
  /** image table: (rep, op) pairs, nCell entries, grouped by rep */
  imageRep: Int32Array;
  imageOp: Int32Array;
  /** index of the identity image of each rep */
  selfImage: Int32Array;
  /** degrees of freedom Σ k */
  dof: number;
}

/** Dynamic state. u stores k free parameters per rep in a D-wide slot. */
export interface SystemState {
  u: Float64Array;
  v: Float64Array;
  /** lattice parameters */
  p: Float64Array;
  step: number;
}

export function occupancyLabel(group: Group, occ: Record<string, number>): string {
  return group.sites
    .filter((s) => (occ[s.letter] ?? 0) > 0)
    .map((s) => `${occ[s.letter]}×${s.label}`)
    .join(" + ");
}

export function buildSystemData(group: Group, occupancy: Record<string, number>): SystemData {
  const D = group.D;
  const siteIdx: number[] = [];
  // general position first, then special sites alphabetically
  const order = [group.sites.length - 1, ...group.sites.slice(0, -1).map((_, i) => i)];
  for (const si of order) {
    const c = occupancy[group.sites[si].letter] ?? 0;
    for (let k = 0; k < c; k++) siteIdx.push(si);
  }
  const n = siteIdx.length;
  const siteOf = Int32Array.from(siteIdx);
  const orbit = Float64Array.from(siteIdx, (si) => group.sites[si].multiplicity);
  const nCell = orbit.reduce((a, b) => a + b, 0);
  const imageRep = new Int32Array(nCell);
  const imageOp = new Int32Array(nCell);
  const selfImage = new Int32Array(n);
  let e = 0;
  for (let i = 0; i < n; i++) {
    selfImage[i] = e;
    for (const g of group.sites[siteOf[i]].cosetOps) {
      imageRep[e] = i;
      imageOp[e] = g;
      e++;
    }
  }
  const dof = siteIdx.reduce((a, si) => a + group.sites[si].k, 0);
  return { D, group, n, nCell, siteOf, orbit, imageRep, imageOp, selfImage, dof };
}

/** Per-site matrices that depend on the box. */
export interface SiteMatrices {
  /** velocity projector onto the Cartesian tangent space, D×D per site */
  Pv: Float64Array[];
  /** u̇ = Du v, (D×D, rows ≥ k zero) per site */
  Du: Float64Array[];
  /** ½ ln det(MᵀM), the log NPT Jacobian per rep on this site */
  logJ: Float64Array;
}

export function siteMatrices(group: Group, B: Float64Array): SiteMatrices {
  const D = group.D;
  const Pv: Float64Array[] = [];
  const Du: Float64Array[] = [];
  const logJ = new Float64Array(group.sites.length);
  group.sites.forEach((site, si) => {
    const k = site.k;
    const pv = new Float64Array(D * D);
    const du = new Float64Array(D * D);
    if (k > 0) {
      const M = matMul(B, site.L, D, D, k); // D×k
      const MtM = matMul(transpose(M, D, k), M, k, D, k);
      const inv = inverse(MtM, k);
      const duk = matMul(inv, transpose(M, D, k), k, k, D); // k×D
      du.set(duk); // rows ≥ k stay zero
      pv.set(matMul(M, duk, D, k, D));
      logJ[si] = 0.5 * Math.log(det(MtM, k));
    }
    Pv.push(pv);
    Du.push(du);
  });
  return { Pv, Du, logJ };
}

/** s = wrap(t + L u) for one rep. */
export function positionOf(site: WyckoffSite, u: ArrayLike<number>, uOff: number, D: number, out: Float64Array, sOff: number) {
  const k = site.k;
  for (let i = 0; i < D; i++) {
    let x = site.t[i];
    for (let c = 0; c < k; c++) x += site.L[i * k + c] * u[uOff + c];
    out[sOff + i] = wrap01(x);
  }
}

function samplePolygonPoint(group: Group, rng: Rng): number[] {
  const poly = group.asymPolygon;
  const D = group.D;
  if (!poly) return Array.from({ length: D }, () => rng.next());
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (;;) {
    const p = [x0 + (x1 - x0) * rng.next(), y0 + (y1 - y0) * rng.next()];
    if (insideHalfSpaces(group.asym, p, -1e-9)) return p;
  }
}

/** Random initial state: reps placed in the asymmetric unit, Maxwell–Boltzmann velocities. */
export function initialState(data: SystemData, density: number, seed: number, T: number): SystemState {
  const { D, group, n } = data;
  const rng = new Rng(seed);
  const lp = group.latticeParams;
  const p = paramsForVolume(lp, data.nCell / density);
  const B = boxFromParams(lp, p);
  const sm = siteMatrices(group, B);
  const u = new Float64Array(n * D);
  const v = new Float64Array(n * D);
  for (let i = 0; i < n; i++) {
    const site = group.sites[data.siteOf[i]];
    if (site.general) {
      const pt = samplePolygonPoint(group, rng);
      for (let c = 0; c < D; c++) u[i * D + c] = pt[c];
    } else {
      for (let c = 0; c < site.k; c++) {
        const [lo, hi] = site.uRange[c];
        u[i * D + c] = lo + (hi - lo) * rng.next();
      }
    }
    const sd = Math.sqrt(T / data.orbit[i]);
    const raw = Array.from({ length: D }, () => sd * rng.normal());
    const Pv = sm.Pv[data.siteOf[i]];
    for (let a = 0; a < D; a++) {
      let acc = 0;
      for (let b = 0; b < D; b++) acc += Pv[a * D + b] * raw[b];
      v[i * D + a] = acc;
    }
  }
  return { u, v, p, step: 0 };
}

/**
 * Fractional positions of every particle in the unit cell (nCell × D),
 * wrapped into [0, 1). Image e is op imageOp[e] applied to rep imageRep[e].
 */
export function cellPositions(data: SystemData, s: Float64Array, out?: Float64Array): Float64Array {
  const { D, nCell, group } = data;
  const res = out ?? new Float64Array(nCell * D);
  const tmp = new Float64Array(D);
  const src = new Float64Array(D);
  for (let e = 0; e < nCell; e++) {
    const i = data.imageRep[e];
    for (let c = 0; c < D; c++) src[c] = s[i * D + c];
    applyAffine(group.ops[data.imageOp[e]], src, tmp);
    for (let c = 0; c < D; c++) res[e * D + c] = wrap01(tmp[c]);
  }
  return res;
}

/** Cartesian rotation part of op g for box B: B R B⁻¹ (used to rotate velocities). */
export function cartesianLinear(op: Parameters<typeof linearPart>[0], B: Float64Array): Float64Array {
  const D = op.D;
  return matMul(matMul(B, linearPart(op), D, D, D), inverse(B, D), D, D, D);
}
