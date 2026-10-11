// WGSL source for the fused symmetric-MD kernel. One workgroup advances one
// system by `steps` BAOAB steps (with NPT box moves) entirely on the GPU.
// The algorithm mirrors cpu/engine.ts line for line; see that file for the
// physics. Generated per dimension; only D = 2 is emitted for now.

import { makeLayout, type Layout } from "./layout";

export const RNG_WGSL = /* wgsl */ `
fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
fn hash4(a: u32, b: u32, c: u32, d: u32) -> u32 { return pcg(a ^ pcg(b ^ pcg(c ^ pcg(d)))); }
const INV24: f32 = 1.0 / 16777216.0;
fn uniform4(a: u32, b: u32, c: u32, d: u32) -> f32 { return f32(hash4(a, b, c, d) >> 8u) * INV24; }
fn gauss(seed: u32, step: u32, i: u32, comp: u32) -> f32 {
  let pair = comp >> 1u;
  let h1 = hash4(seed, step, i, pair * 2u);
  let h2 = hash4(seed, step, i, pair * 2u + 1u);
  let u1 = (f32(h1 >> 8u) + 1.0) * INV24;
  let u2 = f32(h2 >> 8u) * INV24;
  let r = sqrt(-2.0 * log(u1));
  let th = 6.283185307179586 * u2;
  return select(r * cos(th), r * sin(th), (comp & 1u) == 1u);
}
`;

export function structsWgsl(L: Layout): string {
  return /* wgsl */ `
struct Sys {
  n: u32, nCell: u32, nOps: u32, nSites: u32,
  steps: u32, stepStart: u32, seed: u32, nptEvery: u32,
  potCode: u32, latR: u32, flags: u32, dragRep: i32,
  T: f32, P: f32, gamma: f32, dt: f32,
  eps: f32, sig: f32, rc: f32, shift: f32,
  forceCap: f32, dragK: f32, pad0: f32, pad1: f32,
  drag: vec4f,
  M: array<f32, 64>,
}
struct Box {
  p: array<f32, 8>,
  B: array<f32, 9>,
  V: f32, U: f32, KE: f32, delta: f32, rate: f32,
  winAtt: u32, winAcc: u32, attempts: u32, accepts: u32,
  status: u32, nTrans: u32,
  pad: array<u32, 4>,
}
struct Rep { u: vec2f, v: vec2f, f: vec2f, fT: vec2f }
const TOPO_STRIDE: u32 = ${L.TOPO_STRIDE}u;
const OFF_OPS: u32 = ${L.OFF_OPS}u;
const OFF_SITES: u32 = ${L.OFF_SITES}u;
const OFF_COSETS: u32 = ${L.OFF_COSETS}u;
const OFF_SITEOF: u32 = ${L.OFF_SITEOF}u;
const OFF_IMG: u32 = ${L.OFF_IMG}u;
const OPW: u32 = ${L.OPW}u;
const SITEW: u32 = ${L.SITEW}u;
const NMAX: u32 = ${L.NMAX}u;
const IMGMAX: u32 = ${L.IMGMAX}u;
`;
}

export function simShaderSource(D = 2): string {
  const L = makeLayout(D);
  return /* wgsl */ `
${structsWgsl(L)}
${RNG_WGSL}
const WG: u32 = ${L.WG}u;
const OPMAX: u32 = ${L.OPMAX}u;
const SITEMAX: u32 = ${L.SITEMAX}u;
const TMAX: u32 = ${L.TMAX}u;
const MMAX: f32 = ${L.MMAX}.0;
const RMAX: u32 = ${L.RMAX}u;
const MC_STREAM: u32 = 0x5bd1e995u;
const FLAG_MC_ADAPT: u32 = 1u;

@group(0) @binding(0) var<storage, read> sys: array<Sys>;
@group(0) @binding(1) var<storage, read_write> box: array<Box>;
@group(0) @binding(2) var<storage, read> topo: array<u32>;
@group(0) @binding(3) var<storage, read_write> reps: array<Rep>;
@group(0) @binding(4) var<storage, read_write> pos: array<vec2f>;
@group(0) @binding(5) var<storage, read> activeSlots: array<u32>;

var<workgroup> wS: array<vec2f, NMAX>;
var<workgroup> wImg: array<vec2f, IMGMAX>;
var<workgroup> wOpR: array<mat2x2f, OPMAX>;
var<workgroup> wOpT: array<vec2f, OPMAX>;
var<workgroup> wPv: array<mat2x2f, SITEMAX>;
var<workgroup> wDu: array<mat2x2f, SITEMAX>;
var<workgroup> wLogJ: array<f32, SITEMAX>;
var<workgroup> wLogJT: array<f32, SITEMAX>;
var<workgroup> wTrans: array<vec2f, TMAX>;
var<workgroup> wPart: array<vec2f, WG>;
var<workgroup> wRed: array<f32, WG>;
var<workgroup> wP: array<f32, 8>;
var<workgroup> wPT: array<f32, 8>;
var<workgroup> wB: mat2x2f;
var<workgroup> wBinv: mat2x2f;
var<workgroup> wV: f32;
var<workgroup> wBT: mat2x2f;
var<workgroup> wBinvT: mat2x2f;
var<workgroup> wVT: f32;
var<workgroup> wNT: u32;
var<workgroup> wZT: u32;
var<workgroup> wU: f32;
var<workgroup> wUT: f32;
var<workgroup> wFlag: u32;
var<workgroup> wHast: f32;
var<workgroup> wDelta: f32;
var<workgroup> wRate: f32;
var<workgroup> wWinAtt: u32;
var<workgroup> wWinAcc: u32;
var<workgroup> wAtt: u32;
var<workgroup> wAcc: u32;
var<workgroup> wBc0: u32;
var<workgroup> wBc1: u32;
var<workgroup> wBc2: u32;
var<workgroup> wBc3: u32;

struct Pot {
  code: u32, eps: f32, sig2: f32, rc: f32, rc2: f32, shift: f32,
  forceCap: f32, dragK: f32, drag: vec2f, dragRep: i32,
}

fn tf(slot: u32, off: u32) -> f32 { return bitcast<f32>(topo[slot * TOPO_STRIDE + off]); }
fn tu(slot: u32, off: u32) -> u32 { return topo[slot * TOPO_STRIDE + off]; }

/** row-major [a b; c d] -> WGSL column-major matrix */
fn m2(a: f32, b: f32, c: f32, d: f32) -> mat2x2f { return mat2x2f(vec2f(a, c), vec2f(b, d)); }

fn boxFromP(M: array<f32, 64>, latR: u32, p: array<f32, 8>) -> mat2x2f {
  var b = array<f32, 4>(0.0, 0.0, 0.0, 0.0);
  for (var a = 0u; a < 4u; a++) {
    var acc = 0.0;
    for (var c = 0u; c < latR; c++) { acc += M[a * RMAX + c] * p[c]; }
    b[a] = acc;
  }
  return m2(b[0], b[1], b[2], b[3]);
}

fn inv2(m: mat2x2f) -> mat2x2f {
  let d = determinant(m);
  return mat2x2f(vec2f(m[1][1], -m[0][1]), vec2f(-m[1][0], m[0][0])) * (1.0 / d);
}

/** Fill wTrans with lattice images within rc of box B; returns false if too many. (thread 0) */
fn setupTrans(B: mat2x2f, Binv: mat2x2f, rc: f32) -> bool {
  // rows of Binv
  let m0 = floor(rc * length(vec2f(Binv[0][0], Binv[1][0])) + 0.5);
  let m1 = floor(rc * length(vec2f(Binv[0][1], Binv[1][1])) + 0.5);
  if (m0 > MMAX || m1 > MMAX) { return false; }
  let w0 = u32(2.0 * m0 + 1.0);
  let w1 = u32(2.0 * m1 + 1.0);
  var t = 0u;
  for (var a = 0u; a < w0; a++) {
    for (var b = 0u; b < w1; b++) {
      let nv = vec2f(f32(a) - m0, f32(b) - m1);
      wTrans[t] = B * nv;
      if (nv.x == 0.0 && nv.y == 0.0) { wZT = t; }
      t++;
    }
  }
  wNT = t;
  return true;
}

/** Site matrices for site si at box B. Writes Pv, Du, logJ (or only logJ into wLogJT if trial). */
fn siteMats(slot: u32, si: u32, B: mat2x2f, trial: bool) {
  let base = OFF_SITES + si * SITEW;
  let k = tu(slot, base + 6u);
  let Lm = m2(tf(slot, base + 2u), tf(slot, base + 3u), tf(slot, base + 4u), tf(slot, base + 5u));
  var Pv = mat2x2f(vec2f(0.0), vec2f(0.0));
  var Du = mat2x2f(vec2f(0.0), vec2f(0.0));
  var lj = 0.0;
  if (k == 1u) {
    let M = B * Lm[0];
    let mm = dot(M, M);
    // Du: row 0 = M / mm
    Du = mat2x2f(vec2f(M.x / mm, 0.0), vec2f(M.y / mm, 0.0));
    Pv = mat2x2f(M * (M.x / mm), M * (M.y / mm));
    lj = 0.5 * log(mm);
  } else if (k == 2u) {
    let M = B * Lm;
    Du = inv2(M);
    Pv = mat2x2f(vec2f(1.0, 0.0), vec2f(0.0, 1.0));
    lj = log(abs(determinant(M)));
  }
  if (trial) { wLogJT[si] = lj; } else { wPv[si] = Pv; wDu[si] = Du; wLogJ[si] = lj; }
}

fn shapeOk(B: mat2x2f) -> bool {
  let la = length(B[0]);
  let lb = length(B[1]);
  if (max(la, lb) / min(la, lb) > 4.0) { return false; }
  if (abs(dot(B[0], B[1]) / (la * lb)) > 0.8) { return false; }
  return true;
}

/** Pair energy and u'(r)/r. */
fn pairUF(code: u32, eps: f32, sig2: f32, rc: f32, shift: f32, r2: f32) -> vec2f {
  if (code == 2u) {
    let r = sqrt(r2);
    let k = 3.141592653589793 / rc;
    let u = 0.5 * eps * (1.0 + cos(k * r));
    var dr = -0.5 * eps * k * k;
    if (r > 1e-6) { dr = -0.5 * eps * k * sin(k * r) / r; }
    return vec2f(u, dr);
  }
  let x2 = sig2 / r2;
  let x6 = x2 * x2 * x2;
  let x12 = x6 * x6;
  return vec2f(4.0 * eps * (x12 - x6) - shift, 4.0 * eps * (6.0 * x6 - 12.0 * x12) / r2);
}

@compute @workgroup_size(WG)
fn main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) t: u32) {
  if (t == 0u) { wBc0 = activeSlots[wid.x]; }
  let slot = workgroupUniformLoad(&wBc0);
  let S = sys[slot];
  let pot = Pot(S.potCode, S.eps, S.sig * S.sig, S.rc, S.rc * S.rc, S.shift, S.forceCap, S.dragK, S.drag.xy, S.dragRep);
  if (t == 0u) { wBc1 = S.n; wBc2 = S.nCell; wBc3 = S.steps; }
  let n = workgroupUniformLoad(&wBc1);
  let nCell = workgroupUniformLoad(&wBc2);
  let steps = workgroupUniformLoad(&wBc3);
  let repBase = slot * NMAX;
  let h = 0.5 * S.dt;

  // ---- set-up: ops, box, translations, site matrices, positions ----
  if (t < S.nOps) {
    let o = OFF_OPS + t * OPW;
    wOpR[t] = m2(tf(slot, o), tf(slot, o + 1u), tf(slot, o + 2u), tf(slot, o + 3u));
    wOpT[t] = vec2f(tf(slot, o + 4u), tf(slot, o + 5u));
  }
  if (t == 0u) {
    for (var c = 0u; c < 8u; c++) { wP[c] = box[slot].p[c]; }
    wB = boxFromP(S.M, S.latR, wP);
    wBinv = inv2(wB);
    wV = abs(determinant(wB));
    if (!setupTrans(wB, wBinv, S.rc)) { box[slot].status = box[slot].status | 2u; wNT = 0u; }
    wDelta = box[slot].delta;
    wRate = box[slot].rate;
    wWinAtt = box[slot].winAtt;
    wWinAcc = box[slot].winAcc;
    wAtt = box[slot].attempts;
    wAcc = box[slot].accepts;
  }
  workgroupBarrier();
  if (t < S.nSites) { siteMats(slot, t, wB, false); }
  workgroupBarrier();
  for (var i = t; i < n; i += WG) {
    let si = tu(slot, OFF_SITEOF + i) & 255u;
    let sb = OFF_SITES + si * SITEW;
    let Lm = m2(tf(slot, sb + 2u), tf(slot, sb + 3u), tf(slot, sb + 4u), tf(slot, sb + 5u));
    let tt = vec2f(tf(slot, sb), tf(slot, sb + 1u));
    wS[i] = fract(tt + Lm * reps[repBase + i].u);
  }
  workgroupBarrier();

  // initial forces at the current box
  computeImages(slot, nCell, t);
  workgroupBarrier();
  computeForces(slot, pot, n, nCell, t, false);
  workgroupBarrier();

  for (var step = 0u; step < steps; step++) {
    let gstep = S.stepStart + step;
    // ---- B A O A for owned reps ----
    let c1 = exp(-S.gamma * S.dt);
    let c2 = sqrt(max(0.0, 1.0 - c1 * c1));
    for (var i = t; i < n; i += WG) {
      let si = tu(slot, OFF_SITEOF + i) & 255u;
      let sb = OFF_SITES + si * SITEW;
      let periodic = tu(slot, sb + 7u) != 0u;
      let mult = f32(tu(slot, sb + 8u));
      let Lm = m2(tf(slot, sb + 2u), tf(slot, sb + 3u), tf(slot, sb + 4u), tf(slot, sb + 5u));
      let tt = vec2f(tf(slot, sb), tf(slot, sb + 1u));
      var r = reps[repBase + i];
      r.v = wPv[si] * (r.v + h * r.f);
      r.u = r.u + h * (wDu[si] * r.v);
      if (periodic) { r.u = r.u - floor(r.u); }
      if (S.gamma > 0.0) {
        let sd = c2 * sqrt(S.T / mult);
        let xi = vec2f(gauss(S.seed, gstep, i, 0u), gauss(S.seed, gstep, i, 1u));
        r.v = wPv[si] * (c1 * r.v + sd * xi);
      }
      r.u = r.u + h * (wDu[si] * r.v);
      if (periodic) { r.u = r.u - floor(r.u); }
      reps[repBase + i] = r;
      wS[i] = fract(tt + Lm * r.u);
    }
    storageBarrier();
    workgroupBarrier();
    computeImages(slot, nCell, t);
    workgroupBarrier();
    computeForces(slot, pot, n, nCell, t, false);
    workgroupBarrier();

    // ---- NPT: Monte Carlo box move at fixed fractional coordinates ----
    let after = gstep + 1u;
    if (S.nptEvery > 0u && S.T > 0.0 && (after % S.nptEvery) == 0u) {
      if (t == 0u) {
        let r = S.latR;
        let k = min(r - 1u, u32(uniform4(S.seed ^ MC_STREAM, after, 0u, 0u) * f32(r)));
        var s1 = 0.0;
        for (var c = 0u; c < r; c++) { s1 = max(s1, abs(wP[c])); wPT[c] = wP[c]; }
        wPT[k] = wP[k] + wDelta * s1 * (2.0 * uniform4(S.seed ^ MC_STREAM, after, 0u, 1u) - 1.0);
        var s2 = 0.0;
        for (var c = 0u; c < r; c++) { s2 = max(s2, abs(wPT[c])); }
        wHast = log(s1 / s2);
        wAtt += 1u;
        wWinAtt += 1u;
        var ok = abs(wPT[k] - wP[k]) <= wDelta * s2;
        if (ok) {
          wBT = boxFromP(S.M, S.latR, wPT);
          ok = determinant(wBT) > 0.0;
        }
        if (ok) {
          wBinvT = inv2(wBT);
          wVT = determinant(wBT);
          ok = shapeOk(wBT) && setupTrans(wBT, wBinvT, S.rc);
        }
        wFlag = select(0u, 1u, ok);
      }
      let trialOk = workgroupUniformLoad(&wFlag);
      var accepted = 0u;
      if (trialOk == 1u) {
        if (t < S.nSites) { siteMats(slot, t, wBT, true); }
        computeForces(slot, pot, n, nCell, t, true);
        workgroupBarrier();
        if (t == 0u) {
          var dlogJ = 0.0;
          for (var i = 0u; i < n; i++) {
            let si = tu(slot, OFF_SITEOF + i) & 255u;
            dlogJ += wLogJT[si] - wLogJ[si];
          }
          let dH = wUT - wU + S.P * (wVT - wV) - S.T * dlogJ - S.T * wHast;
          var acc = dH <= 0.0;
          if (!acc) { acc = uniform4(S.seed ^ MC_STREAM, after, 0u, 2u) < exp(-dH / S.T); }
          wFlag = select(0u, 1u, acc);
          if (acc) {
            for (var c = 0u; c < 8u; c++) { wP[c] = wPT[c]; }
            wB = wBT; wBinv = wBinvT; wV = wVT; wU = wUT;
            wAcc += 1u;
            wWinAcc += 1u;
          }
        }
        accepted = workgroupUniformLoad(&wFlag);
      }
      if (t == 0u) {
        // translations for the (possibly new) current box
        setupTrans(wB, wBinv, S.rc);
        if ((S.flags & FLAG_MC_ADAPT) != 0u && wWinAtt >= 32u) {
          let rate = f32(wWinAcc) / f32(wWinAtt);
          wRate = rate;
          if (rate > 0.5) { wDelta = min(0.05, wDelta * 1.2); }
          else if (rate < 0.2) { wDelta = max(1e-4, wDelta * 0.8); }
          wWinAtt = 0u;
          wWinAcc = 0u;
        }
      }
      if (accepted == 1u) {
        if (t < S.nSites) { siteMats(slot, t, wB, false); }
        workgroupBarrier();
        for (var i = t; i < n; i += WG) {
          let si = tu(slot, OFF_SITEOF + i) & 255u;
          var r = reps[repBase + i];
          r.f = r.fT;
          r.v = wPv[si] * r.v;
          reps[repBase + i] = r;
        }
      }
      storageBarrier();
      workgroupBarrier();
    }

    // ---- final half kick ----
    for (var i = t; i < n; i += WG) {
      let si = tu(slot, OFF_SITEOF + i) & 255u;
      var r = reps[repBase + i];
      r.v = wPv[si] * (r.v + h * r.f);
      reps[repBase + i] = r;
    }
    storageBarrier();
    workgroupBarrier();
  }

  // ---- write back ----
  var ke = 0.0;
  for (var i = t; i < n; i += WG) {
    let si = tu(slot, OFF_SITEOF + i) & 255u;
    let mult = f32(tu(slot, OFF_SITES + si * SITEW + 8u));
    let v = reps[repBase + i].v;
    ke += 0.5 * mult * dot(v, v);
    pos[repBase + i] = wS[i];
  }
  wRed[t] = ke;
  workgroupBarrier();
  if (t == 0u) {
    var k = 0.0;
    for (var l = 0u; l < WG; l++) { k += wRed[l]; }
    for (var c = 0u; c < 8u; c++) { box[slot].p[c] = wP[c]; }
    box[slot].B[0] = wB[0][0]; box[slot].B[1] = wB[1][0];
    box[slot].B[2] = wB[0][1]; box[slot].B[3] = wB[1][1];
    box[slot].V = wV;
    box[slot].U = wU;
    box[slot].KE = k;
    box[slot].delta = wDelta;
    box[slot].rate = wRate;
    box[slot].winAtt = wWinAtt;
    box[slot].winAcc = wWinAcc;
    box[slot].attempts = wAtt;
    box[slot].accepts = wAcc;
    box[slot].nTrans = wNT;
    if (k != k || abs(k) > 1e30) { box[slot].status = box[slot].status | 1u; }
  }
}

/** Fractional positions of every image (cooperative). */
fn computeImages(slot: u32, nCell: u32, t: u32) {
  for (var q = t; q < nCell; q += WG) {
    let w = tu(slot, OFF_IMG + q);
    let j = w & 0xffffu;
    let g = w >> 16u;
    wImg[q] = fract(wOpR[g] * wS[j] + wOpT[g]);
  }
}

/**
 * Forces on reps and U_cell at the current (trial=false) or trial box.
 * Threads are mapped to (rep, lane) pairs; lanes split the image loop and
 * are reduced in workgroup memory.
 */
fn computeForces(slot: u32, P: Pot, n: u32, nCell: u32, t: u32, trial: bool) {
  let lanes = max(1u, WG / max(n, 1u));
  let perPass = WG / lanes;
  let passes = (n + perPass - 1u) / perPass;
  let local = t / lanes;
  let lane = t % lanes;
  var B = wB;
  if (trial) { B = wBT; }
  let nT = wNT;
  let zT = wZT;
  var uAcc = 0.0;
  for (var ps = 0u; ps < passes; ps++) {
    let i = ps * perPass + local;
    var fi = vec2f(0.0);
    var ei = 0.0;
    let activeRep = local < perPass && i < n;
    if (activeRep) {
      let w = tu(slot, OFF_SITEOF + i);
      let selfQ = w >> 8u;
      let si = wS[i];
      for (var q = lane; q < nCell; q += lanes) {
        var ds = wImg[q] - si;
        ds = ds - round(ds);
        let rd = B * ds;
        let isSelf = q == selfQ;
        for (var tt = 0u; tt < nT; tt++) {
          if (isSelf && tt == zT) { continue; }
          let r = rd + wTrans[tt];
          let r2 = dot(r, r);
          if (r2 < P.rc2 && r2 > 1e-12) {
            let uf = pairUF(P.code, P.eps, P.sig2, P.rc, P.shift, r2);
            ei += 0.5 * uf.x;
            fi += uf.y * r;
          }
        }
      }
    }
    wPart[t] = fi;
    wRed[t] = ei;
    workgroupBarrier();
    if (activeRep && lane == 0u) {
      var F = vec2f(0.0);
      var E = 0.0;
      for (var l = 0u; l < lanes; l++) { F += wPart[t + l]; E += wRed[t + l]; }
      if (i32(i) == P.dragRep) {
        var dd = P.drag - wS[i];
        dd = dd - round(dd);
        F += P.dragK * (B * dd);
      }
      if (P.forceCap > 0.0) {
        let f2 = dot(F, F);
        if (f2 > P.forceCap * P.forceCap) { F = F * (P.forceCap / sqrt(f2)); }
      }
      let si = tu(slot, OFF_SITEOF + i) & 255u;
      let mult = f32(tu(slot, OFF_SITES + si * SITEW + 8u));
      if (trial) { reps[slot * NMAX + i].fT = F; } else { reps[slot * NMAX + i].f = F; }
      uAcc += mult * E;
    }
    workgroupBarrier();
  }
  wRed[t] = uAcc;
  workgroupBarrier();
  if (t == 0u) {
    var U = 0.0;
    for (var l = 0u; l < WG; l++) { U += wRed[l]; }
    if (trial) { wUT = U; } else { wU = U; }
  }
  storageBarrier();
}
`;
}
