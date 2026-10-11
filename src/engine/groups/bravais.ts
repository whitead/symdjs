// Bravais-lattice tensors (Cox & White 2022, §I.B) mapping an unconstrained
// box B′ to a proper lattice B: vec(B) = L vec(B′). vec() is row-major with
// lattice vectors as columns, i.e. index i*D + j is component i of vector j.
//
// Instead of random-walking all D² entries of B′ (most of which sit in the
// null space of L), we work in the row space of L: B = reshape(M p) with
// M = L Qᵀ, Q an orthonormal basis of rowspace(L), and p ∈ R^r the lattice
// parameters. Oblique/triclinic tensors are upper triangular so the frame
// cannot rotate.

import { det, identity, inverse, matMul, matVec, rowSpaceBasis, transpose } from "../math/linalg";

export type Lattice2D = "Oblique" | "Rectangular" | "Square" | "Hexagonal";
export type Lattice3D =
  | "Triclinic"
  | "Monoclinic"
  | "Orthorhombic"
  | "Tetragonal"
  | "Trigonal"
  | "Hexagonal"
  | "Cubic";
export type LatticeName = Lattice2D | Lattice3D;

const s3 = Math.sqrt(3) / 2;
const rep = (n: number, v: number) => Array<number>(n).fill(v);

const tensors2d: Record<Lattice2D, number[][]> = {
  // upper triangular: a along x
  Oblique: [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 1],
  ],
  Rectangular: [[1, 1, 0, 0], rep(4, 0), rep(4, 0), [0, 0, 1, 1]],
  Square: [rep(4, 1), rep(4, 0), rep(4, 0), rep(4, 1)],
  Hexagonal: [rep(4, 1), rep(4, -0.5), rep(4, 0), rep(4, s3)],
};

const z9 = () => rep(9, 0);
const tensors3d: Record<Lattice3D, number[][]> = {
  // upper triangular: a along x, b in xy-plane
  Triclinic: Array.from({ length: 9 }, (_, i) => {
    const r = z9();
    if (![3, 6, 7].includes(i)) r[i] = 1;
    return r;
  }),
  Monoclinic: [
    [1, 0, 0, 1, 0, 0, 1, 0, 0],
    z9(),
    [0, 0, 1, 0, 0, 0, 0, 0, 0],
    z9(),
    [0, 1, 0, 0, 1, 0, 0, 1, 0],
    z9(),
    z9(),
    z9(),
    [0, 0, 0, 0, 0, 1, 0, 0, 1],
  ],
  Orthorhombic: [
    [...rep(3, 1), ...rep(6, 0)],
    z9(),
    z9(),
    z9(),
    [...rep(3, 0), ...rep(3, 1), ...rep(3, 0)],
    z9(),
    z9(),
    z9(),
    [...rep(6, 0), ...rep(3, 1)],
  ],
  Tetragonal: [
    [...rep(6, 1), ...rep(3, 0)],
    z9(),
    z9(),
    z9(),
    [...rep(6, 1), ...rep(3, 0)],
    z9(),
    z9(),
    z9(),
    [...rep(6, 0), ...rep(3, 1)],
  ],
  Trigonal: [
    [...rep(4, 1), ...rep(5, 0)],
    [...rep(3, 0), 1, ...rep(5, 0)],
    [...rep(3, 0), 1, ...rep(5, 0)],
    [...rep(3, 0), 1, ...rep(5, 0)],
    [...rep(4, 1), ...rep(5, 0)],
    [...rep(3, 0), 1, ...rep(5, 0)],
    [...rep(3, 0), 1, ...rep(5, 0)],
    [...rep(3, 0), 1, ...rep(5, 0)],
    [...rep(4, 1), ...rep(5, 0)],
  ],
  Hexagonal: [
    [...rep(3, 1), ...rep(6, 0)],
    [...rep(3, -0.5), ...rep(6, 0)],
    z9(),
    z9(),
    [...rep(3, s3), ...rep(6, 0)],
    z9(),
    z9(),
    z9(),
    [...rep(6, 0), ...rep(3, 1)],
  ],
  Cubic: [
    [...rep(3, 1), ...rep(6, 0)],
    z9(),
    z9(),
    z9(),
    [...rep(3, 1), ...rep(6, 0)],
    z9(),
    z9(),
    z9(),
    [...rep(3, 1), ...rep(6, 0)],
  ],
};

export function bravaisTensor(lattice: LatticeName, D: number): Float64Array {
  const rows =
    D === 2 ? tensors2d[lattice as Lattice2D] : D === 3 ? tensors3d[lattice as Lattice3D] : undefined;
  if (!rows) throw new Error(`no Bravais tensor for ${lattice} in ${D}D`);
  return Float64Array.from(rows.flat());
}

/** Lattice parameterization vec(B) = M p. */
export interface LatticeParams {
  lattice: LatticeName;
  D: number;
  /** number of lattice parameters */
  r: number;
  /** D² × r */
  M: Float64Array;
  /** r × D² (p = Q vec(B′)) */
  Q: Float64Array;
}

export function latticeParams(lattice: LatticeName, D: number): LatticeParams {
  const D2 = D * D;
  const L = bravaisTensor(lattice, D);
  const { basis: Q, rank: r } = rowSpaceBasis(L, D2, D2);
  const M = matMul(L, transpose(Q, r, D2), D2, D2, r);
  return { lattice, D, r, M, Q };
}

/** B (D×D, columns are lattice vectors) from parameters. */
export function boxFromParams(lp: LatticeParams, p: ArrayLike<number>): Float64Array {
  return matVec(lp.M, p, lp.D * lp.D, lp.r);
}

/** Parameters whose box has the given volume (area in 2D), starting from a near-cubic shape. */
export function paramsForVolume(lp: LatticeParams, volume: number): Float64Array {
  const D2 = lp.D * lp.D;
  const p = matVec(lp.Q, identity(lp.D), lp.r, D2);
  const B = boxFromParams(lp, p);
  const v = Math.abs(det(B, lp.D));
  const scale = Math.pow(volume / v, 1 / lp.D);
  for (let i = 0; i < p.length; i++) p[i] *= scale;
  return p;
}

export function boxVolume(B: ArrayLike<number>, D: number): number {
  return Math.abs(det(B, D));
}

export function boxInverse(B: ArrayLike<number>, D: number): Float64Array {
  return inverse(B, D);
}
