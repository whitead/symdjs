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
  potCode: u32, latR: u32, flags: u32, probeOn: i32,
  T: f32, P: f32, gamma: f32, dt: f32,
  eps: f32, sig: f32, rc: f32, shift: f32,
  forceCap: f32, probeA: f32, pad0: f32, pad1: f32,
  probe: vec4f,
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

// Workgroup memory is packed into a few variables: Metal (via naga in
// Firefox) passes each workgroup variable as a separate threadgroup argument
// and allows at most 31 of them.
struct OpW { R: mat2x2f, t: vec2f }
struct SiteW { Pv: mat2x2f, Du: mat2x2f, logJ: f32, logJT: f32 }
struct Ctl {
  B: mat2x2f, Binv: mat2x2f, BT: mat2x2f, BinvT: mat2x2f,
  V: f32, VT: f32, U: f32, UT: f32,
  hast: f32, delta: f32, rate: f32, pad0: f32,
  nT: u32, zT: u32, winAtt: u32, winAcc: u32,
  att: u32, acc: u32, pad1: u32, pad2: u32,
  p: array<f32, 8>,
  pT: array<f32, 8>,
}
var<workgroup> wS: array<vec2f, NMAX>;
var<workgroup> wImg: array<vec2f, IMGMAX>;
var<workgroup> wOps: array<OpW, OPMAX>;
var<workgroup> wSite: array<SiteW, SITEMAX>;
var<workgroup> wTrans: array<vec2f, TMAX>;
var<workgroup> wPart: array<vec2f, WG>;
var<workgroup> wRed: array<f32, WG>;
var<workgroup> wc: Ctl;
// broadcast slots for workgroupUniformLoad
var<workgroup> wFlag: u32;
var<workgroup> wBc0: u32;
var<workgroup> wBc1: u32;
var<workgroup> wBc2: u32;
var<workgroup> wBc3: u32;

struct Pot {
  code: u32, eps: f32, sig2: f32, rc: f32, rc2: f32, shift: f32,
  forceCap: f32, probeA: f32, probe: vec2f, probeW: f32, probeOn: i32, nOps: u32,
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
      if (nv.x == 0.0 && nv.y == 0.0) { wc.zT = t; }
      t++;
    }
  }
  wc.nT = t;
  return true;
}

/** Site matrices for site si at box B. Writes Pv, Du, logJ (or only the trial logJT). */
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
  if (trial) { wSite[si].logJT = lj; } else { wSite[si].Pv = Pv; wSite[si].Du = Du; wSite[si].logJ = lj; }
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
  let pot = Pot(S.potCode, S.eps, S.sig * S.sig, S.rc, S.rc * S.rc, S.shift, S.forceCap, S.probeA, S.probe.xy, S.probe.z, S.probeOn, S.nOps);
  if (t == 0u) { wBc1 = S.n; wBc2 = S.nCell; wBc3 = S.steps; }
  let n = workgroupUniformLoad(&wBc1);
  let nCell = workgroupUniformLoad(&wBc2);
  let steps = workgroupUniformLoad(&wBc3);
  let repBase = slot * NMAX;
  let h = 0.5 * S.dt;

  // ---- set-up: ops, box, translations, site matrices, positions ----
  if (t < S.nOps) {
    let o = OFF_OPS + t * OPW;
    wOps[t].R = m2(tf(slot, o), tf(slot, o + 1u), tf(slot, o + 2u), tf(slot, o + 3u));
    wOps[t].t = vec2f(tf(slot, o + 4u), tf(slot, o + 5u));
  }
  if (t == 0u) {
    for (var c = 0u; c < 8u; c++) { wc.p[c] = box[slot].p[c]; }
    wc.B = boxFromP(S.M, S.latR, wc.p);
    wc.Binv = inv2(wc.B);
    wc.V = abs(determinant(wc.B));
    if (!setupTrans(wc.B, wc.Binv, S.rc)) { box[slot].status = box[slot].status | 2u; wc.nT = 0u; }
    wc.delta = box[slot].delta;
    wc.rate = box[slot].rate;
    wc.winAtt = box[slot].winAtt;
    wc.winAcc = box[slot].winAcc;
    wc.att = box[slot].attempts;
    wc.acc = box[slot].accepts;
  }
  workgroupBarrier();
  if (t < S.nSites) { siteMats(slot, t, wc.B, false); }
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
      r.v = wSite[si].Pv * (r.v + h * r.f);
      r.u = r.u + h * (wSite[si].Du * r.v);
      if (periodic) { r.u = r.u - floor(r.u); }
      if (S.gamma > 0.0) {
        let sd = c2 * sqrt(S.T / mult);
        let xi = vec2f(gauss(S.seed, gstep, i, 0u), gauss(S.seed, gstep, i, 1u));
        r.v = wSite[si].Pv * (c1 * r.v + sd * xi);
      }
      r.u = r.u + h * (wSite[si].Du * r.v);
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
        for (var c = 0u; c < r; c++) { s1 = max(s1, abs(wc.p[c])); wc.pT[c] = wc.p[c]; }
        wc.pT[k] = wc.p[k] + wc.delta * s1 * (2.0 * uniform4(S.seed ^ MC_STREAM, after, 0u, 1u) - 1.0);
        var s2 = 0.0;
        for (var c = 0u; c < r; c++) { s2 = max(s2, abs(wc.pT[c])); }
        wc.hast = log(s1 / s2);
        wc.att += 1u;
        wc.winAtt += 1u;
        var ok = abs(wc.pT[k] - wc.p[k]) <= wc.delta * s2;
        if (ok) {
          wc.BT = boxFromP(S.M, S.latR, wc.pT);
          ok = determinant(wc.BT) > 0.0;
        }
        if (ok) {
          wc.BinvT = inv2(wc.BT);
          wc.VT = determinant(wc.BT);
          ok = shapeOk(wc.BT) && setupTrans(wc.BT, wc.BinvT, S.rc);
        }
        wFlag = select(0u, 1u, ok);
      }
      let trialOk = workgroupUniformLoad(&wFlag);
      var accepted = 0u;
      if (trialOk == 1u) {
        if (t < S.nSites) { siteMats(slot, t, wc.BT, true); }
        computeForces(slot, pot, n, nCell, t, true);
        workgroupBarrier();
        if (t == 0u) {
          var dlogJ = 0.0;
          for (var i = 0u; i < n; i++) {
            let si = tu(slot, OFF_SITEOF + i) & 255u;
            dlogJ += wSite[si].logJT - wSite[si].logJ;
          }
          let dH = wc.UT - wc.U + S.P * (wc.VT - wc.V) - S.T * dlogJ - S.T * wc.hast;
          var acc = dH <= 0.0;
          if (!acc) { acc = uniform4(S.seed ^ MC_STREAM, after, 0u, 2u) < exp(-dH / S.T); }
          wFlag = select(0u, 1u, acc);
          if (acc) {
            for (var c = 0u; c < 8u; c++) { wc.p[c] = wc.pT[c]; }
            wc.B = wc.BT; wc.Binv = wc.BinvT; wc.V = wc.VT; wc.U = wc.UT;
            wc.acc += 1u;
            wc.winAcc += 1u;
          }
        }
        accepted = workgroupUniformLoad(&wFlag);
      }
      if (t == 0u) {
        // translations for the (possibly new) current box
        setupTrans(wc.B, wc.Binv, S.rc);
        if ((S.flags & FLAG_MC_ADAPT) != 0u && wc.winAtt >= 32u) {
          let rate = f32(wc.winAcc) / f32(wc.winAtt);
          wc.rate = rate;
          if (rate > 0.5) { wc.delta = min(0.05, wc.delta * 1.2); }
          else if (rate < 0.2) { wc.delta = max(1e-4, wc.delta * 0.8); }
          wc.winAtt = 0u;
          wc.winAcc = 0u;
        }
      }
      if (accepted == 1u) {
        if (t < S.nSites) { siteMats(slot, t, wc.B, false); }
        workgroupBarrier();
        for (var i = t; i < n; i += WG) {
          let si = tu(slot, OFF_SITEOF + i) & 255u;
          var r = reps[repBase + i];
          r.f = r.fT;
          r.v = wSite[si].Pv * r.v;
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
      r.v = wSite[si].Pv * (r.v + h * r.f);
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
    for (var c = 0u; c < 8u; c++) { box[slot].p[c] = wc.p[c]; }
    box[slot].B[0] = wc.B[0][0]; box[slot].B[1] = wc.B[1][0];
    box[slot].B[2] = wc.B[0][1]; box[slot].B[3] = wc.B[1][1];
    box[slot].V = wc.V;
    box[slot].U = wc.U;
    box[slot].KE = k;
    box[slot].delta = wc.delta;
    box[slot].rate = wc.rate;
    box[slot].winAtt = wc.winAtt;
    box[slot].winAcc = wc.winAcc;
    box[slot].attempts = wc.att;
    box[slot].accepts = wc.acc;
    box[slot].nTrans = wc.nT;
    if (k != k || abs(k) > 1e30) { box[slot].status = box[slot].status | 1u; }
  }
}

/** Fractional positions of every image (cooperative). */
fn computeImages(slot: u32, nCell: u32, t: u32) {
  for (var q = t; q < nCell; q += WG) {
    let w = tu(slot, OFF_IMG + q);
    let j = w & 0xffffu;
    let g = w >> 16u;
    wImg[q] = fract(wOps[g].R * wS[j] + wOps[g].t);
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
  var B = wc.B;
  if (trial) { B = wc.BT; }
  let nT = wc.nT;
  let zT = wc.zT;
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
      if (P.probeOn != 0) {
        // a soft touch: Gaussian repulsion u = A exp(-r²/2w²) from every
        // symmetric image of the pointer, so the field stays G-invariant
        let w2 = P.probeW * P.probeW;
        for (var g = 0u; g < P.nOps; g++) {
          var dd = wS[i] - fract(wOps[g].R * P.probe + wOps[g].t);
          dd = dd - round(dd);
          let r = B * dd;
          F += (P.probeA / w2) * exp(-0.5 * dot(r, r) / w2) * r;
        }
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
    if (trial) { wc.UT = U; } else { wc.U = U; }
  }
  storageBarrier();
}
`;
}
