// ============================================================================
// PLACEHOLDER SIMULATION: delete this folder when the WebGPU view lands.
//
// A toy, overdamped soft-disc model that exists only so the page layout can
// be judged with something alive in every slot. It is NOT the symmetric MD
// engine: no Lennard-Jones, no Langevin/BAOAB integrator, no NPT Monte
// Carlo, no RATTLE. It does stamp images with the real group operations from
// src/engine/groups, so every pattern has the right plane-group symmetry.
// ============================================================================

import type { Group, WyckoffSite } from "../../../engine/groups/group";
import { planeGroup } from "../../../engine/groups/library";
import { affineInverse, applyAffine, wrap01, type Affine } from "../../../engine/math/affine";
import { Rng } from "../../../engine/math/rng";
import { latticeBasis, type Occupancy } from "../../lib/groups";
import type { Potential, SimPhase, SimStats } from "../types";

export interface ToyRep {
  site: WyckoffSite;
  /** indices into scene.ops of the distinct images (identity first) */
  ops: number[];
  /** fractional position */
  s: Float64Array;
  /** line parameter for k = 1 sites */
  u: number;
  /** palette index */
  color: number;
  fx: number;
  fy: number;
  pinned: boolean;
}

export interface ToyControls {
  temperature: number;
  pressure: number;
  potential: Potential;
  /** explainer: breathe the box within its Bravais constraints */
  breathe: boolean;
}

export interface ToyScene {
  group: Group;
  ops: Affine[];
  invOps: Affine[];
  reps: ToyRep[];
  /** target lattice (σ units), row-major, columns are lattice vectors */
  B0: Float64Array;
  B: Float64Array;
  Binv: Float64Array;
  nCell: number;
  step: number;
  durationSteps: number;
  phase: SimPhase;
  lambda: number;
  lambda0: number;
  T: number;
  energy: number;
  virial: number;
  released: boolean;
  rng: Rng;
  seed: number;
  /** scratch image table */
  ix: Float64Array;
  iy: Float64Array;
  ir: Int32Array;
}

const PHI = 0.8; // packing fraction of the grown crystal (diameter σ = 1)
const DT = 0.06;
const T_HOT = 0.05;

/** Map reduced temperature T* onto the toy's noise scale. */
const toyT = (tStar: number) => 0.0006 + 0.05 * tStar * tStar;
const tStarOf = (t: number) => Math.sqrt(Math.max(0, t - 0.0006) / 0.05);
const stiffness = (p: Potential) => (p === "soft" ? 0.45 : p === "wca" ? 1.5 : 1);

function setSitePosition(rep: ToyRep) {
  const { site } = rep;
  if (site.general) return;
  if (site.k === 0) {
    rep.s[0] = wrap01(site.t[0]);
    rep.s[1] = wrap01(site.t[1]);
  } else {
    rep.s[0] = wrap01(site.t[0] + site.L[0] * rep.u);
    rep.s[1] = wrap01(site.t[1] + site.L[1] * rep.u);
  }
}

function inside(poly: number[][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function randomInAsym(g: Group, rng: Rng): [number, number] {
  const poly = g.asymPolygon;
  if (!poly || poly.length < 3) return [rng.next(), rng.next()];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let tries = 0; tries < 200; tries++) {
    const x = x0 + rng.next() * (x1 - x0);
    const y = y0 + rng.next() * (y1 - y0);
    if (inside(poly, x, y)) return [x, y];
  }
  return [x0, y0];
}

function setBox(sc: ToyScene, sx: number, sy: number) {
  const { B0, B, Binv } = sc;
  // scale x and y components (keeps square/hex shapes when sx === sy)
  B[0] = B0[0] * sx;
  B[1] = B0[1] * sx;
  B[2] = B0[2] * sy;
  B[3] = B0[3] * sy;
  const d = B[0] * B[3] - B[1] * B[2];
  Binv[0] = B[3] / d;
  Binv[1] = -B[1] / d;
  Binv[2] = -B[2] / d;
  Binv[3] = B[0] / d;
}

export function createToyScene(groupName: string, occupancy: Occupancy, seed: number, durationSteps = 1500): ToyScene {
  const group = planeGroup(groupName);
  const rng = new Rng(seed * 2654435761 + 12345);
  const ops = group.ops;
  const invOps = ops.map(affineInverse);
  // palette permutation so neighbouring orbits get distinct hues
  const perm = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const reps: ToyRep[] = [];
  let nCell = 0;
  for (const site of group.sites) {
    const count = occupancy[site.letter] ?? 0;
    for (let c = 0; c < count; c++) {
      const rep: ToyRep = {
        site,
        ops: site.cosetOps,
        s: new Float64Array(2),
        u: 0,
        color: perm[reps.length % perm.length],
        fx: 0,
        fy: 0,
        pinned: false,
      };
      if (site.general) {
        const [x, y] = randomInAsym(group, rng);
        rep.s[0] = x;
        rep.s[1] = y;
      } else if (site.k === 1) {
        const [lo, hi] = site.uRange[0] ?? [0, 1];
        rep.u = lo + (0.1 + 0.8 * rng.next()) * (hi - lo);
        setSitePosition(rep);
      } else setSitePosition(rep);
      reps.push(rep);
      nCell += site.multiplicity;
    }
  }
  const basis = latticeBasis(group);
  const det = Math.abs(basis[0] * basis[3] - basis[1] * basis[2]);
  const area = (Math.max(1, nCell) * Math.PI) / 4 / PHI;
  const k = Math.sqrt(area / det);
  const B0 = basis.map((v) => v * k);
  const total = reps.reduce((n, r) => n + r.ops.length, 0);
  const sc: ToyScene = {
    group,
    ops,
    invOps,
    reps,
    B0,
    B: new Float64Array(4),
    Binv: new Float64Array(4),
    nCell,
    step: 0,
    durationSteps: Math.round(durationSteps * (0.88 + 0.24 * rng.next())),
    phase: "compressing",
    lambda: 1.6,
    lambda0: 1.6,
    T: T_HOT,
    energy: 0,
    virial: 0,
    released: false,
    rng,
    seed,
    ix: new Float64Array(total),
    iy: new Float64Array(total),
    ir: new Int32Array(total),
  };
  setBox(sc, sc.lambda, sc.lambda);
  return sc;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

function schedule(sc: ToyScene, c: ToyControls) {
  const p = sc.step / sc.durationSteps;
  const lp = Math.pow(2 / Math.max(0.2, c.pressure), 0.06);
  const tc = toyT(c.temperature);
  if (sc.released) {
    sc.phase = "released";
    sc.lambda = lp;
    sc.T = tc;
  } else if (p < 0.3) {
    sc.phase = "compressing";
    sc.lambda = lp + (sc.lambda0 - lp) * (1 - smooth(p / 0.3));
    sc.T = T_HOT;
  } else if (p < 0.78) {
    sc.phase = "annealing";
    sc.lambda = lp;
    sc.T = T_HOT * Math.pow(Math.min(tc, T_HOT) / T_HOT, (p - 0.3) / 0.48);
  } else {
    sc.phase = "crystal";
    sc.lambda = lp;
    sc.T = tc;
  }
  let sx = sc.lambda;
  let sy = sc.lambda;
  if (c.breathe) {
    const w = sc.step * 0.012;
    const lat = sc.group.lattice;
    if (lat === "Rectangular" || lat === "Oblique") {
      sx *= 1 + 0.07 * Math.sin(w);
      sy *= 1 - 0.07 * Math.sin(w);
    } else {
      sx *= 1 + 0.06 * Math.sin(w);
      sy = sx;
    }
  }
  setBox(sc, sx, sy);
}

/** Advance the toy by n steps. */
export function stepToy(sc: ToyScene, c: ToyControls, n = 1) {
  for (let it = 0; it < n; it++) stepOnce(sc, c);
}

function stepOnce(sc: ToyScene, c: ToyControls) {
  schedule(sc, c);
  const { reps, ops, B, Binv, ix, iy, ir } = sc;
  const kk = stiffness(c.potential);
  // image table (wrapped fractional coordinates)
  let m = 0;
  const tmp = new Float64Array(2);
  for (let j = 0; j < reps.length; j++) {
    const r = reps[j];
    for (const o of r.ops) {
      applyAffine(ops[o], r.s, tmp);
      ix[m] = wrap01(tmp[0]);
      iy[m] = wrap01(tmp[1]);
      ir[m] = j;
      m++;
    }
  }
  let energy = 0;
  let virial = 0;
  for (let i = 0; i < reps.length; i++) {
    const ri = reps[i];
    const sx = ri.s[0];
    const sy = ri.s[1];
    let fx = 0;
    let fy = 0;
    let ei = 0;
    let wi = 0;
    for (let q = 0; q < m; q++) {
      let dx = ix[q] - sx;
      let dy = iy[q] - sy;
      dx -= Math.round(dx);
      dy -= Math.round(dy);
      for (let nx = -1; nx <= 1; nx++)
        for (let ny = -1; ny <= 1; ny++) {
          const ax = dx + nx;
          const ay = dy + ny;
          const qx = B[0] * ax + B[1] * ay;
          const qy = B[2] * ax + B[3] * ay;
          const r2 = qx * qx + qy * qy;
          if (r2 >= 1 || r2 < 1e-12) continue;
          const r = Math.sqrt(r2);
          const ov = 1 - r;
          const f = kk * ov;
          fx -= (f * qx) / r;
          fy -= (f * qy) / r;
          ei += 0.25 * kk * ov * ov;
          wi += 0.5 * r * f;
        }
    }
    ri.fx = fx;
    ri.fy = fy;
    energy += ri.ops.length * ei;
    virial += ri.ops.length * wi;
  }
  sc.energy = energy / Math.max(1, sc.nCell);
  sc.virial = virial;

  const amp = Math.sqrt(2 * sc.T * DT);
  for (const r of reps) {
    if (r.pinned || (!r.site.general && r.site.k === 0)) continue;
    let dqx = r.fx * DT + amp * sc.rng.normal();
    let dqy = r.fy * DT + amp * sc.rng.normal();
    const len = Math.hypot(dqx, dqy);
    if (len > 0.15) {
      dqx *= 0.15 / len;
      dqy *= 0.15 / len;
    }
    if (r.site.general) {
      r.s[0] = wrap01(r.s[0] + Binv[0] * dqx + Binv[1] * dqy);
      r.s[1] = wrap01(r.s[1] + Binv[2] * dqx + Binv[3] * dqy);
    } else {
      // confined to the mirror line: project the step onto M = B L
      const mx = B[0] * r.site.L[0] + B[1] * r.site.L[1];
      const my = B[2] * r.site.L[0] + B[3] * r.site.L[1];
      r.u += (mx * dqx + my * dqy) / (mx * mx + my * my);
      if (r.site.uPeriodic) r.u -= Math.floor(r.u);
      setSitePosition(r);
    }
  }
  sc.step++;
}

/** Run the protocol to completion (static previews, reduced motion). */
export function fastForward(sc: ToyScene, c: ToyControls) {
  const end = Math.max(sc.step, sc.durationSteps + 120);
  stepToy(sc, c, end - sc.step);
}

/** Turn every image into an independent particle (p1 dynamics). */
export function releaseToy(sc: ToyScene) {
  if (sc.released) return;
  const general = sc.group.sites[sc.group.sites.length - 1];
  const reps: ToyRep[] = [];
  const tmp = new Float64Array(2);
  for (const r of sc.reps)
    for (const o of r.ops) {
      applyAffine(sc.ops[o], r.s, tmp);
      reps.push({
        site: general,
        ops: [0],
        s: Float64Array.of(wrap01(tmp[0]), wrap01(tmp[1])),
        u: 0,
        color: r.color,
        fx: 0,
        fy: 0,
        pinned: false,
      });
    }
  sc.reps = reps;
  sc.released = true;
  sc.ix = new Float64Array(reps.length);
  sc.iy = new Float64Array(reps.length);
  sc.ir = new Int32Array(reps.length);
}

/**
 * Drag: place image `op` of rep `rep` (in lattice tile n) at fractional
 * position (fx, fy); all other images follow through the group.
 */
export function dragRep(sc: ToyScene, rep: number, op: number, nx: number, ny: number, fx: number, fy: number) {
  const r = sc.reps[rep];
  if (!r) return;
  const target = applyAffine(sc.invOps[op], [fx - nx, fy - ny]);
  if (r.site.general) {
    r.s[0] = wrap01(target[0]);
    r.s[1] = wrap01(target[1]);
  } else if (r.site.k === 1) {
    let dx = target[0] - r.site.t[0];
    let dy = target[1] - r.site.t[1];
    dx -= Math.round(dx);
    dy -= Math.round(dy);
    const { B } = sc;
    const qx = B[0] * dx + B[1] * dy;
    const qy = B[2] * dx + B[3] * dy;
    const mx = B[0] * r.site.L[0] + B[1] * r.site.L[1];
    const my = B[2] * r.site.L[0] + B[3] * r.site.L[1];
    r.u = (mx * qx + my * qy) / (mx * mx + my * my);
    if (r.site.uPeriodic) r.u -= Math.floor(r.u);
    setSitePosition(r);
  }
}

export function toyStats(sc: ToyScene): SimStats {
  const area = Math.abs(sc.B[0] * sc.B[3] - sc.B[1] * sc.B[2]);
  const density = sc.nCell / area;
  return {
    phase: sc.phase,
    progress: Math.min(1, sc.step / (sc.durationSteps * 0.78)),
    nCell: sc.nCell,
    density,
    energy: sc.energy,
    temperature: tStarOf(sc.T),
    pressure: density * sc.T * 40 + (sc.virial / (2 * area)) * 40,
  };
}
