// User-defined groups: close a set of generators (xyz notation) under
// composition modulo lattice translations, and find the most general
// Bravais lattice whose metric all operations preserve.

import { affineIdentity, compose, equalMod1, linearPart, reduceMod1, type Affine } from "../math/affine";
import { matMul, transpose } from "../math/linalg";
import { Rng } from "../math/rng";
import { boxFromParams, latticeParams, paramsForVolume, type Lattice2D } from "./bravais";
import type { Group, WyckoffSite } from "./group";
import { parseOp } from "./notation";

export interface CustomGroupResult {
  group?: Group;
  error?: string;
  /** closure size before failing, for messages */
  order?: number;
}

/** Generate the group from generators (mod lattice); null if it exceeds maxOrder. */
export function closeGroup(gens: Affine[], D: number, maxOrder = 48): Affine[] | null {
  const ops: Affine[] = [affineIdentity(D)];
  const add = (g: Affine) => {
    const r = reduceMod1(g);
    if (ops.some((o) => equalMod1(o, r))) return false;
    ops.push(r);
    return true;
  };
  gens.forEach(add);
  for (let changed = true; changed; ) {
    changed = false;
    const snapshot = ops.slice();
    for (const a of snapshot)
      for (const b of snapshot) {
        if (add(compose(a, b))) changed = true;
        if (ops.length > maxOrder) return null;
      }
  }
  return ops;
}

function preservesMetric(ops: Affine[], B: Float64Array): boolean {
  const D = ops[0].D;
  const G = matMul(transpose(B, D, D), B, D, D, D);
  return ops.every((op) => {
    const R = linearPart(op);
    const RtGR = matMul(matMul(transpose(R, D, D), G, D, D, D), R, D, D, D);
    return RtGR.every((v, i) => Math.abs(v - G[i]) < 1e-9 * Math.max(1, Math.abs(G[i])));
  });
}

/** The most general 2D lattice compatible with all ops (tested at random metrics), or null. */
export function detectLattice(ops: Affine[]): Lattice2D | null {
  const rng = new Rng(99);
  for (const lattice of ["Oblique", "Rectangular", "Square", "Hexagonal"] as Lattice2D[]) {
    const lp = latticeParams(lattice, 2);
    let ok = true;
    for (let trial = 0; trial < 3 && ok; trial++) {
      const p = paramsForVolume(lp, 1);
      for (let i = 0; i < p.length; i++) p[i] += 0.5 * (rng.next() - 0.5);
      ok = preservesMetric(ops, boxFromParams(lp, p));
    }
    if (ok) return lattice;
  }
  return null;
}

export function formatOp(op: Affine): string {
  const D = op.D;
  const vars = ["x", "y", "z"];
  const n = D + 1;
  const frac = (v: number): string => {
    for (const d of [1, 2, 3, 4, 6, 8, 12]) {
      const k = Math.round(v * d);
      if (Math.abs(k / d - v) < 1e-9) return d === 1 ? String(k) : `${k}/${d}`;
    }
    return v.toFixed(4);
  };
  const comps: string[] = [];
  for (let i = 0; i < D; i++) {
    let s = "";
    for (let j = 0; j < D; j++) {
      const c = op.m[i * n + j];
      if (Math.abs(c) < 1e-12) continue;
      const mag = Math.abs(c) === 1 ? "" : frac(Math.abs(c));
      s += (c < 0 ? "-" : s ? "+" : "") + mag + vars[j];
    }
    const t = op.m[i * n + D];
    if (Math.abs(t) > 1e-12) s += (t < 0 ? "-" : s ? "+" : "") + frac(Math.abs(t));
    comps.push(s || "0");
  }
  return comps.join(",");
}

/**
 * Build a simulatable group from generator strings (one op per entry).
 * Custom groups use only the general position; the asymmetric unit is the
 * whole cell (random starts are relaxed by the soft-potential stage).
 */
export function buildCustomGroup(generators: string[], maxOrder = 12): CustomGroupResult {
  const D = 2;
  const gens: Affine[] = [];
  for (const line of generators.map((l) => l.trim()).filter(Boolean)) {
    try {
      gens.push(parseOp(line, D));
    } catch (e) {
      return { error: `Could not read “${line}”: ${(e as Error).message}` };
    }
  }
  for (const g of gens) {
    const R = linearPart(g);
    const det = R[0] * R[3] - R[1] * R[2];
    if (Math.abs(Math.abs(det) - 1) > 1e-9 || !R.every((v) => Math.abs(v - Math.round(v)) < 1e-9))
      return { error: `“${formatOp(g)}” is not a lattice symmetry (its linear part must be an integer matrix with determinant ±1).` };
  }
  const ops = closeGroup(gens, D, 48);
  if (!ops) return { error: "These generators do not close into a finite group modulo the lattice." };
  if (ops.length > maxOrder) return { error: `The group has order ${ops.length}; the GPU kernel supports up to ${maxOrder}.`, order: ops.length };
  const lattice = detectLattice(ops);
  if (!lattice) return { error: "No two-dimensional lattice is preserved by all of these operations.", order: ops.length };
  const general: WyckoffSite = {
    letter: "a",
    label: `${ops.length}a`,
    multiplicity: ops.length,
    k: D,
    general: true,
    t: new Float64Array(D),
    L: Float64Array.from([1, 0, 0, 1]),
    uPeriodic: true,
    uRange: [
      [0, 1],
      [0, 1],
    ],
    cosetOps: ops.map((_, i) => i),
    siteSymmetryOrder: 1,
    repr: "x,y",
    coords: ops.map(formatOp),
  };
  const group: Group = {
    D,
    number: 0,
    name: "custom",
    lattice,
    ops,
    order: ops.length,
    sites: [general],
    asym: [],
    latticeParams: latticeParams(lattice, D),
  };
  return { group };
}
