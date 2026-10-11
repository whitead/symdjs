// Reference CPU engine (Float64). This is the oracle for the WebGPU engine:
// the algorithm, RNG streams and parameter semantics are identical.

import { applyAffine, wrap01 } from "../math/affine";
import { det, inverse } from "../math/linalg";
import { gaussian, uniform4 } from "../math/rng";
import { boxFromParams } from "../groups/bravais";
import { potentialParams, type PotentialParams } from "../core/potentials";
import {
  buildSystemData,
  defaultParams,
  initialState,
  positionOf,
  siteMatrices,
  type SimParams,
  type SiteMatrices,
  type SystemData,
  type SystemSpec,
  type SystemState,
} from "../core/system";

export interface Stats {
  step: number;
  /** potential energy per particle (U_cell / N_cell) */
  pe: number;
  /** kinetic energy of the cell */
  ke: number;
  /** total energy of the cell (KE + U) */
  etot: number;
  /** instantaneous temperature 2 KE / DOF */
  T: number;
  /** cell volume (area in 2D) */
  V: number;
  /** number density N_cell / V */
  rho: number;
  /** recent box-move acceptance rate */
  accept: number;
  /** box move step size (relative) */
  delta: number;
}

export interface Translations {
  /** Cartesian translation vectors B n, count × D */
  vecs: Float64Array;
  count: number;
  zero: number;
  m: Int32Array;
}

/** Lattice images that can lie within rc: |n_k| ≤ ⌊rc |b*_k| + ½⌋. */
export function translations(B: Float64Array, Binv: Float64Array, D: number, rc: number, maxM = 6): Translations | null {
  const m = new Int32Array(D);
  let count = 1;
  for (let k = 0; k < D; k++) {
    let r2 = 0;
    for (let j = 0; j < D; j++) r2 += Binv[k * D + j] ** 2;
    m[k] = Math.floor(rc * Math.sqrt(r2) + 0.5);
    if (m[k] > maxM) return null;
    count *= 2 * m[k] + 1;
  }
  const vecs = new Float64Array(count * D);
  const idx = new Int32Array(D);
  let zero = -1;
  for (let t = 0; t < count; t++) {
    let rem = t;
    let isZero = true;
    for (let k = D - 1; k >= 0; k--) {
      const w = 2 * m[k] + 1;
      idx[k] = (rem % w) - m[k];
      rem = Math.floor(rem / w);
      if (idx[k] !== 0) isZero = false;
    }
    if (isZero) zero = t;
    for (let a = 0; a < D; a++) {
      let acc = 0;
      for (let k = 0; k < D; k++) acc += B[a * D + k] * idx[k];
      vecs[t * D + a] = acc;
    }
  }
  return { vecs, count, zero, m };
}

export interface Box {
  p: Float64Array;
  B: Float64Array;
  Binv: Float64Array;
  V: number;
  sm: SiteMatrices;
  tr: Translations;
}

const MC_STREAM = 0x5bd1e995;

export class CpuSim {
  readonly data: SystemData;
  readonly state: SystemState;
  params: SimParams;
  seed: number;
  box!: Box;
  /** fractional positions of reps (n × D) */
  readonly s: Float64Array;
  /** force on each rep particle (n × D) */
  f: Float64Array;
  /** per-rep energy E_i */
  e: Float64Array;
  /** U_cell */
  U = 0;
  mc = { delta: 0.004, attempts: 0, accepts: 0, winAtt: 0, winAcc: 0, rate: 0 };
  private pp: PotentialParams;
  private img: Float64Array;
  private fTrial: Float64Array;
  private eTrial: Float64Array;

  constructor(spec: SystemSpec, state?: SystemState) {
    this.params = { ...defaultParams, ...spec.params };
    this.seed = spec.seed >>> 0;
    this.data = buildSystemData(spec.group, spec.occupancy);
    this.state = state ?? initialState(this.data, spec.density, spec.seed, this.params.T);
    const { n, nCell, D } = this.data;
    this.s = new Float64Array(n * D);
    this.f = new Float64Array(n * D);
    this.e = new Float64Array(n);
    this.fTrial = new Float64Array(n * D);
    this.eTrial = new Float64Array(n);
    this.img = new Float64Array(nCell * D);
    this.pp = potentialParams(this.params.potential);
    const box = this.makeBox(this.state.p);
    if (!box) throw new Error("initial box too small for cutoff");
    this.box = box;
    this.updatePositions();
    this.U = this.computeForces(this.box, this.f, this.e);
  }

  get D() {
    return this.data.D;
  }

  setParams(p: Partial<SimParams>) {
    const potChanged = p.potential && JSON.stringify(p.potential) !== JSON.stringify(this.params.potential);
    this.params = { ...this.params, ...p };
    if (potChanged) {
      this.pp = potentialParams(this.params.potential);
      const box = this.makeBox(this.state.p);
      if (box) this.box = box;
      this.U = this.computeForces(this.box, this.f, this.e);
    }
  }

  makeBox(p: Float64Array): Box | null {
    const { D, group } = this.data;
    const B = boxFromParams(group.latticeParams, p);
    const d = det(B, D);
    if (!(d > 0)) return null;
    const Binv = inverse(B, D);
    const tr = translations(B, Binv, D, this.pp.rc);
    if (!tr) return null;
    return { p: Float64Array.from(p), B, Binv, V: d, sm: siteMatrices(group, B), tr };
  }

  /** s_i = wrap(t + L u_i) for all reps */
  updatePositions() {
    const { D, n, group, siteOf } = this.data;
    for (let i = 0; i < n; i++) positionOf(group.sites[siteOf[i]], this.state.u, i * D, D, this.s, i * D);
  }

  /** Forces on reps and per-rep energies at the given box; returns U_cell. */
  computeForces(box: Box, f: Float64Array, e: Float64Array): number {
    const { D, n, nCell, group, imageRep, imageOp, selfImage, orbit } = this.data;
    const { B, tr } = box;
    const pp = this.pp;
    const img = this.img;
    const s = this.s;
    // image positions
    const src = new Float64Array(D);
    const dst = new Float64Array(D);
    for (let q = 0; q < nCell; q++) {
      const j = imageRep[q];
      for (let c = 0; c < D; c++) src[c] = s[j * D + c];
      applyAffine(group.ops[imageOp[q]], src, dst);
      for (let c = 0; c < D; c++) img[q * D + c] = wrap01(dst[c]);
    }
    f.fill(0);
    e.fill(0);
    const ds = new Float64Array(D);
    const rd = new Float64Array(D);
    const rc2 = pp.rc2;
    const code = pp.code;
    const eps = pp.eps;
    const sig2 = pp.sig * pp.sig;
    const shift = pp.shift;
    const kSoft = Math.PI / pp.rc;
    let U = 0;
    for (let i = 0; i < n; i++) {
      let ei = 0;
      const fi = new Float64Array(D);
      for (let q = 0; q < nCell; q++) {
        for (let c = 0; c < D; c++) {
          let d = img[q * D + c] - s[i * D + c];
          d -= Math.round(d);
          ds[c] = d;
        }
        for (let a = 0; a < D; a++) {
          let acc = 0;
          for (let c = 0; c < D; c++) acc += B[a * D + c] * ds[c];
          rd[a] = acc;
        }
        const self = q === selfImage[i];
        for (let t = 0; t < tr.count; t++) {
          if (self && t === tr.zero) continue;
          let r2 = 0;
          for (let a = 0; a < D; a++) {
            const x = rd[a] + tr.vecs[t * D + a];
            r2 += x * x;
          }
          if (r2 >= rc2 || r2 < 1e-24) continue;
          let u: number;
          let dr: number;
          if (code === 2) {
            const r = Math.sqrt(r2);
            u = 0.5 * eps * (1 + Math.cos(kSoft * r));
            dr = r > 1e-12 ? (-0.5 * eps * kSoft * Math.sin(kSoft * r)) / r : -0.5 * eps * kSoft * kSoft;
          } else {
            const x2 = sig2 / r2;
            const x6 = x2 * x2 * x2;
            const x12 = x6 * x6;
            u = 4 * eps * (x12 - x6) - shift;
            dr = (4 * eps * (6 * x6 - 12 * x12)) / r2;
          }
          ei += 0.5 * u;
          for (let a = 0; a < D; a++) fi[a] += dr * (rd[a] + tr.vecs[t * D + a]);
        }
      }
      // force cap
      const cap = this.params.forceCap;
      if (Number.isFinite(cap)) {
        let f2 = 0;
        for (let a = 0; a < D; a++) f2 += fi[a] * fi[a];
        if (f2 > cap * cap) {
          const sc = cap / Math.sqrt(f2);
          for (let a = 0; a < D; a++) fi[a] *= sc;
        }
      }
      for (let a = 0; a < D; a++) f[i * D + a] = fi[a];
      e[i] = ei;
      U += orbit[i] * ei;
    }
    return U;
  }

  private project(i: number) {
    const D = this.D;
    const Pv = this.box.sm.Pv[this.data.siteOf[i]];
    const v = this.state.v;
    const tmp = new Float64Array(D);
    for (let a = 0; a < D; a++) {
      let acc = 0;
      for (let b = 0; b < D; b++) acc += Pv[a * D + b] * v[i * D + b];
      tmp[a] = acc;
    }
    for (let a = 0; a < D; a++) v[i * D + a] = tmp[a];
  }

  private kick(half: number) {
    const { D, n } = this.data;
    const v = this.state.v;
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < D; a++) v[i * D + a] += half * this.f[i * D + a];
      this.project(i);
    }
  }

  private drift(half: number) {
    const { D, n, group, siteOf } = this.data;
    const { u, v } = this.state;
    for (let i = 0; i < n; i++) {
      const site = group.sites[siteOf[i]];
      const Du = this.box.sm.Du[siteOf[i]];
      for (let c = 0; c < site.k; c++) {
        let acc = 0;
        for (let b = 0; b < D; b++) acc += Du[c * D + b] * v[i * D + b];
        u[i * D + c] += half * acc;
        if (site.uPeriodic) u[i * D + c] -= Math.floor(u[i * D + c]);
      }
    }
    this.updatePositions();
  }

  private thermostat() {
    const { D, n, orbit } = this.data;
    const { gamma, dt, T } = this.params;
    if (gamma <= 0) return;
    const c1 = Math.exp(-gamma * dt);
    const c2 = Math.sqrt(Math.max(0, 1 - c1 * c1));
    const v = this.state.v;
    const step = this.state.step;
    for (let i = 0; i < n; i++) {
      const sd = c2 * Math.sqrt(T / orbit[i]);
      for (let a = 0; a < D; a++) v[i * D + a] = c1 * v[i * D + a] + sd * gaussian(this.seed, step, i, a);
      this.project(i);
    }
  }

  /** One Monte Carlo box move at fixed fractional coordinates. */
  private boxMove() {
    const { P, T } = this.params;
    if (P === null || T <= 0) return;
    const step = this.state.step;
    const cur = this.box;
    const r = cur.p.length;
    const k = Math.min(r - 1, Math.floor(uniform4(this.seed ^ MC_STREAM, step, 0, 0) * r));
    // step size proportional to the lattice scale; the proposal is then not
    // symmetric, so include the Hastings ratio q(p'→p)/q(p→p') = s(p)/s(p')
    const scaleOf = (p: Float64Array) => {
      let s = 0;
      for (let j = 0; j < r; j++) s = Math.max(s, Math.abs(p[j]));
      return s;
    };
    const s1 = scaleOf(cur.p);
    const p2 = Float64Array.from(cur.p);
    p2[k] += this.mc.delta * s1 * (2 * uniform4(this.seed ^ MC_STREAM, step, 0, 1) - 1);
    const s2 = scaleOf(p2);
    this.mc.attempts++;
    this.mc.winAtt++;
    const trial = Math.abs(p2[k] - cur.p[k]) <= this.mc.delta * s2 ? this.makeBox(p2) : null;
    let accepted = false;
    if (trial && this.shapeOk(trial.B)) {
      const U2 = this.computeForces(trial, this.fTrial, this.eTrial);
      const { siteOf } = this.data;
      let dlogJ = 0;
      for (let i = 0; i < siteOf.length; i++) dlogJ += trial.sm.logJ[siteOf[i]] - cur.sm.logJ[siteOf[i]];
      const dH = U2 - this.U + P * (trial.V - cur.V) - T * dlogJ - T * Math.log(s1 / s2);
      if (dH <= 0 || uniform4(this.seed ^ MC_STREAM, step, 0, 2) < Math.exp(-dH / T)) {
        accepted = true;
        this.box = trial;
        this.state.p.set(p2);
        [this.f, this.fTrial] = [this.fTrial, this.f];
        [this.e, this.eTrial] = [this.eTrial, this.e];
        this.U = U2;
        for (let i = 0; i < this.data.n; i++) this.project(i);
      }
    }
    if (accepted) {
      this.mc.accepts++;
      this.mc.winAcc++;
    }
    if (this.params.mcAdapt && this.mc.winAtt >= 32) {
      const rate = this.mc.winAcc / this.mc.winAtt;
      this.mc.rate = rate;
      if (rate > 0.5) this.mc.delta = Math.min(0.05, this.mc.delta * 1.2);
      else if (rate < 0.2) this.mc.delta = Math.max(1e-4, this.mc.delta * 0.8);
      this.mc.winAtt = 0;
      this.mc.winAcc = 0;
    }
  }

  /** Keep cells from degenerating: bounded aspect ratio and angles. */
  private shapeOk(B: Float64Array): boolean {
    const D = this.D;
    const len: number[] = [];
    for (let j = 0; j < D; j++) {
      let l2 = 0;
      for (let i = 0; i < D; i++) l2 += B[i * D + j] ** 2;
      len.push(Math.sqrt(l2));
    }
    if (Math.max(...len) / Math.min(...len) > 4) return false;
    for (let a = 0; a < D; a++)
      for (let b = a + 1; b < D; b++) {
        let d = 0;
        for (let i = 0; i < D; i++) d += B[i * D + a] * B[i * D + b];
        if (Math.abs(d / (len[a] * len[b])) > 0.8) return false;
      }
    return true;
  }

  /** BAOAB Langevin steps (velocity Verlet when gamma = 0). */
  step(count = 1) {
    const half = 0.5 * this.params.dt;
    for (let c = 0; c < count; c++) {
      this.kick(half);
      this.drift(half);
      this.thermostat();
      this.drift(half);
      this.state.step++;
      this.U = this.computeForces(this.box, this.f, this.e);
      if (this.params.P !== null && this.state.step % this.params.nptEvery === 0) this.boxMove();
      this.kick(half);
    }
  }

  kineticEnergy(): number {
    const { D, n, orbit } = this.data;
    const v = this.state.v;
    let ke = 0;
    for (let i = 0; i < n; i++) {
      let v2 = 0;
      for (let a = 0; a < D; a++) v2 += v[i * D + a] ** 2;
      ke += 0.5 * orbit[i] * v2;
    }
    return ke;
  }

  stats(): Stats {
    const ke = this.kineticEnergy();
    const { nCell, dof } = this.data;
    return {
      step: this.state.step,
      pe: this.U / nCell,
      ke,
      etot: ke + this.U,
      T: dof > 0 ? (2 * ke) / dof : 0,
      V: this.box.V,
      rho: nCell / this.box.V,
      accept: this.mc.rate,
      delta: this.mc.delta,
    };
  }

  /** Cartesian positions of all particles in the cell (nCell × D). */
  cellCartesian(): Float64Array {
    const { D, nCell } = this.data;
    const out = new Float64Array(nCell * D);
    const B = this.box.B;
    this.computeImagesInto(this.img);
    for (let q = 0; q < nCell; q++)
      for (let a = 0; a < D; a++) {
        let acc = 0;
        for (let c = 0; c < D; c++) acc += B[a * D + c] * this.img[q * D + c];
        out[q * D + a] = acc;
      }
    return out;
  }

  private computeImagesInto(img: Float64Array) {
    const { D, nCell, group, imageRep, imageOp } = this.data;
    const src = new Float64Array(D);
    const dst = new Float64Array(D);
    for (let q = 0; q < nCell; q++) {
      const j = imageRep[q];
      for (let c = 0; c < D; c++) src[c] = this.s[j * D + c];
      applyAffine(group.ops[imageOp[q]], src, dst);
      for (let c = 0; c < D; c++) img[q * D + c] = wrap01(dst[c]);
    }
  }
}
