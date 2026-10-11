// Buffer layout shared by the WGSL kernels and the host. Every system lives
// in a fixed-size slot, so offsets are slot * stride and nothing needs
// compaction when systems come and go.

export interface Layout {
  D: number;
  /** threads per workgroup */
  WG: number;
  /** max reps per system */
  NMAX: number;
  /** max particles per unit cell */
  IMGMAX: number;
  /** max general-position ops */
  OPMAX: number;
  /** max Wyckoff sites (incl. general) */
  SITEMAX: number;
  /** max coset-op entries per system */
  COSETMAX: number;
  /** max lattice images per dimension (|n_k| ≤ MMAX) */
  MMAX: number;
  /** max translation vectors (2 MMAX + 1)^D */
  TMAX: number;
  /** max lattice parameters */
  RMAX: number;
  /** words per op: R (D×D row-major) + t (D) */
  OPW: number;
  /** words per site: t (D), L (D×D row-major), k, periodic, mult, cosetStart */
  SITEW: number;
  OFF_OPS: number;
  OFF_SITES: number;
  OFF_COSETS: number;
  OFF_SITEOF: number;
  OFF_IMG: number;
  TOPO_STRIDE: number;
  /** words per Sys record */
  SYSW: number;
  /** words per Box record */
  BOXW: number;
  /** floats per Rep record: u, v, f, fT (each padded vecD) */
  REPW: number;
  /** floats per position (padded vecD) */
  POSW: number;
  MAX_SLOTS: number;
}

export function makeLayout(D: number): Layout {
  if (D !== 2) throw new Error("GPU kernels are generated for D = 2 only (3D groundwork in place)");
  const WG = 64;
  const NMAX = 256;
  const IMGMAX = 768;
  const OPMAX = 12;
  const SITEMAX = 10;
  const COSETMAX = 128;
  const MMAX = 4;
  const TMAX = (2 * MMAX + 1) ** D;
  const RMAX = 4;
  const OPW = D * D + D;
  const SITEW = D + D * D + 4;
  const OFF_OPS = 0;
  const OFF_SITES = OFF_OPS + OPMAX * OPW;
  const OFF_COSETS = OFF_SITES + SITEMAX * SITEW;
  const OFF_SITEOF = OFF_COSETS + COSETMAX;
  const OFF_IMG = OFF_SITEOF + NMAX;
  const TOPO_STRIDE = Math.ceil((OFF_IMG + IMGMAX) / 64) * 64;
  // Sys: 24 scalars, drag vec4 (offset 96 B), M[64]
  const SYSW = 24 + 4 + 64;
  const BOXW = 32;
  const vecW = D === 2 ? 2 : 4;
  return {
    D, WG, NMAX, IMGMAX, OPMAX, SITEMAX, COSETMAX, MMAX, TMAX, RMAX, OPW, SITEW,
    OFF_OPS, OFF_SITES, OFF_COSETS, OFF_SITEOF, OFF_IMG, TOPO_STRIDE, SYSW, BOXW,
    REPW: 4 * vecW, POSW: vecW, MAX_SLOTS: 32,
  };
}

/** Box record field offsets (words). */
export const BOX = {
  p: 0, // [8]
  B: 8, // [9] row-major D×D
  V: 17,
  U: 18,
  KE: 19,
  delta: 20,
  rate: 21,
  winAtt: 22,
  winAcc: 23,
  attempts: 24,
  accepts: 25,
  status: 26,
  nTrans: 27,
} as const;

/** Sys record field offsets (words). */
export const SYS = {
  n: 0, nCell: 1, nOps: 2, nSites: 3,
  steps: 4, stepStart: 5, seed: 6, nptEvery: 7,
  potCode: 8, latR: 9, flags: 10, dragRep: 11,
  T: 12, P: 13, gamma: 14, dt: 15,
  eps: 16, sig: 17, rc: 18, shift: 19,
  forceCap: 20, dragK: 21,
  drag: 24, // vec4
  M: 28, // [64], row-major D² × RMAX
} as const;

export const FLAG_MC_ADAPT = 1;
