// Symmetry groups assembled from the symd group tables (Bilbao-derived):
// general-position ops, Wyckoff sites with derived coset ops, asymmetric
// units as half-spaces, and the Bravais lattice parameterization.

import {
  affineIdentity,
  applyAffine,
  compose,
  equalMod1,
  isIdentityLinear,
  linearPart,
  translationPart,
  wrap01,
  type Affine,
} from "../math/affine";
import { det, rank } from "../math/linalg";
import { latticeParams, type LatticeName, type LatticeParams } from "./bravais";
import { insideHalfSpaces, parseInequalities, parseOp, type HalfSpace } from "./notation";

export interface RawSite {
  name: string;
  size?: number;
  sites: string[];
}

export interface RawGroup {
  lattice: string;
  genpos: string[];
  asymm_unit?: string;
  specpos?: RawSite[];
}

export interface WyckoffSite {
  /** Wyckoff letter (the general position gets the next letter) */
  letter: string;
  /** e.g. "4e" */
  label: string;
  /** number of images in the conventional cell */
  multiplicity: number;
  /** number of free parameters (D for the general position) */
  k: number;
  general: boolean;
  /** representative manifold s = t + L u */
  t: Float64Array;
  /** D × k row-major; column c is the direction of free parameter c */
  L: Float64Array;
  /** u ↦ u + 1 is a lattice translation (true for crystallographic sites) */
  uPeriodic: boolean;
  /** range of u that keeps the representative inside the asymmetric unit (per parameter) */
  uRange: [number, number][];
  /** indices into group.ops giving the distinct images, identity first */
  cosetOps: number[];
  /** |G| / multiplicity */
  siteSymmetryOrder: number;
  /** representative coordinate string from the table (in free parameters x,y,z) */
  repr: string;
  /** all coordinate strings from the table */
  coords: string[];
}

export interface Group {
  D: number;
  /** International number (1-17 in 2D, 1-230 in 3D) */
  number: number;
  /** short Hermann–Mauguin symbol */
  name: string;
  /** Conway orbifold symbol (2D) */
  orbifold?: string;
  lattice: LatticeName;
  /** general-position ops in fractional coordinates; ops[0] is the identity */
  ops: Affine[];
  order: number;
  /** special sites (alphabetical) followed by the general position */
  sites: WyckoffSite[];
  asym: HalfSpace[];
  /** 2D: asymmetric unit polygon vertices in fractional coordinates (CCW) */
  asymPolygon?: number[][];
  latticeParams: LatticeParams;
}

export const names2d = [
  "p1", "p2", "pm", "pg", "cm", "pmm", "pmg", "pgg", "cmm",
  "p4", "p4m", "p4g", "p3", "p3m1", "p31m", "p6", "p6m",
] as const;

export const orbifold2d: Record<string, string> = {
  p1: "o", p2: "2222", pm: "**", pg: "××", cm: "*×", pmm: "*2222", pmg: "22*", pgg: "22×",
  cmm: "2*22", p4: "442", p4m: "*442", p4g: "4*2", p3: "333", p3m1: "*333", p31m: "3*3",
  p6: "632", p6m: "*632",
};

const GENERIC = [0.1234567, 0.3456789, 0.2718281];

function orbitImages(ops: Affine[], p0: Float64Array, D: number): { opIdx: number[]; pts: Float64Array[] } {
  const opIdx: number[] = [];
  const pts: Float64Array[] = [];
  ops.forEach((g, gi) => {
    const q = applyAffine(g, p0);
    for (let i = 0; i < D; i++) q[i] = wrap01(q[i]);
    const dup = pts.some((p) => {
      for (let i = 0; i < D; i++) {
        const d = p[i] - q[i];
        if (Math.abs(d - Math.round(d)) > 1e-7) return false;
      }
      return true;
    });
    if (!dup) {
      opIdx.push(gi);
      pts.push(q);
    }
  });
  return { opIdx, pts };
}

/** Intersection of the line t + L u (k=1) with half-spaces: [lo, hi] or null. */
function lineInterval(hs: HalfSpace[], t: Float64Array, Lcol: Float64Array, tol = 1e-9): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  for (const h of hs) {
    let at = 0;
    let al = 0;
    for (let j = 0; j < t.length; j++) {
      at += h.a[j] * t[j];
      al += h.a[j] * Lcol[j];
    }
    const rhs = h.b - at;
    if (Math.abs(al) < 1e-12) {
      if (rhs < -tol) return null;
    } else if (al > 0) hi = Math.min(hi, rhs / al);
    else lo = Math.max(lo, rhs / al);
  }
  return hi - lo > tol ? [lo, hi] : null;
}

/** Clip a big square by half-spaces (2D). */
function polygonFromHalfSpaces(hs: HalfSpace[]): number[][] {
  let poly = [
    [-2, -2],
    [3, -2],
    [3, 3],
    [-2, 3],
  ];
  for (const h of hs) {
    const out: number[][] = [];
    const f = (p: number[]) => h.a[0] * p[0] + h.a[1] * p[1] - h.b;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const fp = f(p);
      const fq = f(q);
      if (fp <= 0) out.push(p);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
        const s = fp / (fp - fq);
        out.push([p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])]);
      }
    }
    poly = out;
  }
  // drop near-duplicate vertices
  return poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-10;
  });
}

export function polygonArea(poly: number[][]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function buildSite(
  raw: RawSite,
  ops: Affine[],
  asym: HalfSpace[],
  D: number,
): WyckoffSite {
  const order = ops.length;
  const maps = raw.sites.map((s) => parseOp(s, D));
  // free parameters = columns of the site map that are used
  const A0 = linearPart(maps[0]);
  const paramIdx: number[] = [];
  for (let j = 0; j < D; j++) {
    let used = false;
    for (const m of maps) {
      const A = linearPart(m);
      for (let i = 0; i < D; i++) if (A[i * D + j] !== 0) used = true;
    }
    if (used) paramIdx.push(j);
  }
  const k = paramIdx.length;
  if (rank(A0, D, D) !== k) throw new Error(`site ${raw.name}: dependent parameters`);

  // generic point → coset ops
  const P0 = Float64Array.from(GENERIC.slice(0, D));
  const p0 = applyAffine(maps[0], P0);
  const { opIdx } = orbitImages(ops, p0, D);

  // choose the representative coordinate string (and lattice shift) whose
  // manifold overlaps the asymmetric unit the most
  let best: { mi: number; t: Float64Array; L: Float64Array; range: [number, number][]; score: number } | null = null;
  const shifts: number[][] = [];
  const rng = [-1, 0, 1];
  if (D === 2) rng.forEach((a) => rng.forEach((b) => shifts.push([a, b])));
  else rng.forEach((a) => rng.forEach((b) => rng.forEach((c) => shifts.push([a, b, c]))));
  // prefer unshifted representatives on ties
  shifts.sort((p, q) => p.reduce((s, v) => s + Math.abs(v), 0) - q.reduce((s, v) => s + Math.abs(v), 0));
  maps.forEach((m, mi) => {
    const A = linearPart(m);
    const t0 = translationPart(m);
    const L = new Float64Array(D * k);
    paramIdx.forEach((j, c) => {
      for (let i = 0; i < D; i++) L[i * k + c] = A[i * D + j];
    });
    for (const sh of shifts) {
      const t = Float64Array.from(t0, (v, i) => v + sh[i]);
      if (k === 0) {
        if (insideHalfSpaces(asym, t, 1e-9) && (!best || best.score < 1)) best = { mi, t, L, range: [], score: 1 };
      } else if (k === 1) {
        const iv = lineInterval(asym, t, Float64Array.from({ length: D }, (_, i) => L[i]));
        if (iv && (!best || iv[1] - iv[0] > best.score + 1e-9)) best = { mi, t, L, range: [iv], score: iv[1] - iv[0] };
      } else {
        // k ≥ 2 only occurs for planes in 3D; fall back to the first map
        if (!best) best = { mi, t, L, range: Array.from({ length: k }, () => [0, 1]), score: 0 };
      }
    }
  });
  if (!best) {
    // site does not touch the asymmetric unit (should not happen); use first map
    const A = linearPart(maps[0]);
    const L = new Float64Array(D * k);
    paramIdx.forEach((j, c) => {
      for (let i = 0; i < D; i++) L[i * k + c] = A[i * D + j];
    });
    best = { mi: 0, t: translationPart(maps[0]), L, range: Array.from({ length: k }, () => [0, 1]), score: 0 };
  }
  const b = best as { mi: number; t: Float64Array; L: Float64Array; range: [number, number][] };
  const uPeriodic = Array.from(b.L).every((v) => Math.abs(v - Math.round(v)) < 1e-12);
  return {
    letter: raw.name,
    label: `${opIdx.length}${raw.name}`,
    multiplicity: opIdx.length,
    k,
    general: false,
    t: b.t,
    L: b.L,
    uPeriodic,
    uRange: b.range,
    cosetOps: opIdx,
    siteSymmetryOrder: order / opIdx.length,
    repr: raw.sites[b.mi],
    coords: raw.sites,
  };
}

export function buildGroup(raw: RawGroup, number: number, D: number, name?: string): Group {
  const ops = raw.genpos.map((s) => parseOp(s, D));
  if (!ops.length || !isIdentityLinear(ops[0]) || Array.from(translationPart(ops[0])).some((v) => Math.abs(v - Math.round(v)) > 1e-12))
    throw new Error(`group ${number}: first op must be the identity`);
  const asym = raw.asymm_unit ? parseInequalities(raw.asymm_unit, D) : [];
  const special = (raw.specpos ?? []).map((s) => buildSite(s, ops, asym, D));
  special.sort((a, b) => a.letter.localeCompare(b.letter));
  const nextLetter = String.fromCharCode(
    special.length ? Math.max(...special.map((s) => s.letter.charCodeAt(0))) + 1 : "a".charCodeAt(0),
  );
  const generalL = new Float64Array(D * D);
  for (let i = 0; i < D; i++) generalL[i * D + i] = 1;
  const general: WyckoffSite = {
    letter: nextLetter,
    label: `${ops.length}${nextLetter}`,
    multiplicity: ops.length,
    k: D,
    general: true,
    t: new Float64Array(D),
    L: generalL,
    uPeriodic: true,
    uRange: Array.from({ length: D }, () => [0, 1] as [number, number]),
    cosetOps: ops.map((_, i) => i),
    siteSymmetryOrder: 1,
    repr: ["x", "y", "z"].slice(0, D).join(","),
    coords: raw.genpos,
  };
  const groupName = name ?? (D === 2 ? names2d[number - 1] : `#${number}`);
  const g: Group = {
    D,
    number,
    name: groupName,
    orbifold: D === 2 ? orbifold2d[groupName] : undefined,
    lattice: raw.lattice as LatticeName,
    ops,
    order: ops.length,
    sites: [...special, general],
    asym,
    latticeParams: latticeParams(raw.lattice as LatticeName, D),
  };
  if (D === 2 && asym.length) g.asymPolygon = polygonFromHalfSpaces(asym);
  return g;
}

/** Check that ops compose to ops modulo lattice translations. Returns the first failure or null. */
export function closureFailure(g: Group): string | null {
  for (let i = 0; i < g.ops.length; i++)
    for (let j = 0; j < g.ops.length; j++) {
      const c = compose(g.ops[i], g.ops[j]);
      if (!g.ops.some((o) => equalMod1(o, c))) return `ops ${i}∘${j} not in group`;
    }
  return null;
}

/** det of the linear part of op (±1 for isometries in a suitable metric). */
export function opDeterminant(op: Affine): number {
  return det(linearPart(op), op.D);
}

export function identityOp(D: number): Affine {
  return affineIdentity(D);
}
