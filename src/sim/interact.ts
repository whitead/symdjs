// Pointer interaction and symmetry release for GPU systems.

import { affineInverse, applyAffine, linearPart, wrap01 } from "../engine/math/affine";
import { inverse, matMul } from "../engine/math/linalg";
import { boxFromParams } from "../engine/groups/bravais";
import { planeGroup } from "../engine/groups/library";
import { cellPositions, type SimParams } from "../engine/core/system";
import type { GpuEngine, GpuSystem } from "../engine/gpu/engine";
import type { SimView } from "../engine/render/renderer";

export interface Grab {
  rep: number;
  op: number;
  /** lattice translation of the grabbed copy */
  n: [number, number];
}

/** Find the particle image under a Cartesian point; null if none within `radius` σ. */
export async function pick(engine: GpuEngine, sys: GpuSystem, x: [number, number], radius = 0.7): Promise<Grab | null> {
  const { s, B } = await engine.downloadState(sys);
  const data = sys.data;
  const img = cellPositions(data, s);
  const Bi = inverse(B, 2);
  const f = [Bi[0] * x[0] + Bi[1] * x[1], Bi[2] * x[0] + Bi[3] * x[1]];
  let best: Grab | null = null;
  let bestD = radius;
  for (let q = 0; q < data.nCell; q++) {
    const d = [f[0] - img[2 * q], f[1] - img[2 * q + 1]];
    const n: [number, number] = [Math.round(d[0]), Math.round(d[1])];
    const r = [d[0] - n[0], d[1] - n[1]];
    const dist = Math.hypot(B[0] * r[0] + B[1] * r[1], B[2] * r[0] + B[3] * r[1]);
    if (dist < bestD) {
      bestD = dist;
      best = { rep: data.imageRep[q], op: data.imageOp[q], n };
    }
  }
  return best;
}

/** Steer the grabbed rep so that its grabbed copy follows the Cartesian point x. */
export function dragTo(sys: GpuSystem, grab: Grab, x: [number, number], B: Float64Array, k = 80) {
  const Bi = inverse(B, 2);
  const f = [Bi[0] * x[0] + Bi[1] * x[1] - grab.n[0], Bi[2] * x[0] + Bi[3] * x[1] - grab.n[1]];
  const ginv = affineInverse(sys.group.ops[grab.op]);
  const t = applyAffine(ginv, f);
  sys.drag = { rep: grab.rep, target: [wrap01(t[0]), wrap01(t[1])], k };
}

/** Wire pointer events on a view's canvas. Returns a cleanup function. */
export function attachDrag(engine: GpuEngine, view: SimView, onGrab?: (g: Grab | null) => void): () => void {
  const canvas = view.canvas;
  let grab: Grab | null = null;
  let pending = false;
  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return view.toSim(e.clientX - r.left, e.clientY - r.top);
  };
  const down = async (e: PointerEvent) => {
    if (pending || e.button !== 0) return;
    pending = true;
    const x = local(e);
    const g = await pick(engine, view.sys, x);
    pending = false;
    if (!g) return;
    grab = g;
    canvas.setPointerCapture(e.pointerId);
    view.setOptions({ highlightRep: g.rep });
    dragTo(view.sys, g, x, view.B);
    onGrab?.(g);
    canvas.style.cursor = "grabbing";
  };
  const move = (e: PointerEvent) => {
    if (!grab) return;
    dragTo(view.sys, grab, local(e), view.B);
  };
  const up = () => {
    if (!grab) return;
    grab = null;
    view.sys.drag = null;
    view.setOptions({ highlightRep: -1 });
    onGrab?.(null);
    canvas.style.cursor = "";
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
  };
}

/**
 * Release the symmetry: expand the unit cell (as a k×k supercell) into a p1
 * system with every particle independent. Velocities are copied as the
 * symmetric images of the rep velocities, which keeps each particle's
 * kinetic temperature (T / orbit) unchanged.
 */
export async function releaseSymmetry(
  engine: GpuEngine,
  sys: GpuSystem,
  params: Partial<SimParams> = {},
): Promise<GpuSystem> {
  const { state, s, B } = await engine.downloadState(sys);
  const data = sys.data;
  const img = cellPositions(data, s);
  const NMAX = engine.layout.NMAX;
  const k = data.nCell * 9 <= NMAX ? 3 : data.nCell * 4 <= NMAX ? 2 : 1;
  const nCellBig = data.nCell * k * k;
  if (nCellBig > NMAX) throw new Error("cell too large to release");
  const Bi = inverse(B, 2);
  const u = new Float64Array(nCellBig * 2);
  const v = new Float64Array(nCellBig * 2);
  let idx = 0;
  for (let a = 0; a < k; a++)
    for (let b = 0; b < k; b++)
      for (let q = 0; q < data.nCell; q++) {
        u[idx * 2] = (img[2 * q] + a) / k;
        u[idx * 2 + 1] = (img[2 * q + 1] + b) / k;
        const j = data.imageRep[q];
        const Rc = matMul(matMul(B, linearPart(sys.group.ops[data.imageOp[q]]), 2, 2, 2), Bi, 2, 2, 2);
        const vj = [state.v[2 * j], state.v[2 * j + 1]];
        v[idx * 2] = Rc[0] * vj[0] + Rc[1] * vj[1];
        v[idx * 2 + 1] = Rc[2] * vj[0] + Rc[3] * vj[1];
        idx++;
      }
  const p1 = planeGroup("p1");
  const Bbig = Float64Array.from(B, (x) => x * k);
  const lp = p1.latticeParams;
  const p = new Float64Array(lp.r);
  for (let r = 0; r < lp.r; r++) for (let c = 0; c < 4; c++) p[r] += lp.Q[r * 4 + c] * Bbig[c];
  const check = boxFromParams(lp, p);
  if (Math.abs(check[2]) > 1e-6 * Math.abs(check[0])) throw new Error("lattice not upper triangular");
  const phi = data.nCell / Math.max(1, data.n);
  return engine.add(
    {
      group: p1,
      occupancy: { a: nCellBig },
      density: nCellBig / Math.abs(B[0] * B[3] - B[1] * B[2]) / (k * k),
      seed: sys.seed + 101,
      params: { ...sys.params, T: sys.params.T / phi, P: null, ...params },
    },
    { u, v, p, step: 0 },
  );
}
