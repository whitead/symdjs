// Pointer interaction and symmetry release for GPU systems.

import { linearPart, wrap01 } from "../engine/math/affine";
import { inverse, matMul } from "../engine/math/linalg";
import { boxFromParams } from "../engine/groups/bravais";
import { planeGroup } from "../engine/groups/library";
import { cellPositions, type SimParams } from "../engine/core/system";
import type { GpuEngine, GpuSystem } from "../engine/gpu/engine";
import type { SimView } from "../engine/render/renderer";

export interface ProbeOptions {
  /** amplitude A of the Gaussian repulsion u = A exp(-r²/2w²) (ε) */
  strength: number;
  /** width w (σ) */
  width: number;
}

const defaultProbe: ProbeOptions = { strength: 6, width: 1.4 };

/**
 * Press and move on a view's canvas to touch the pattern: a soft repulsive
 * probe sits under the pointer and at every symmetric image of it, so the
 * disturbance is mirrored across the crystal. The force is bounded, so the
 * simulation cannot be driven to blow up. Returns a cleanup function.
 */
export function attachProbe(view: SimView, opts: Partial<ProbeOptions> = {}): () => void {
  const o = { ...defaultProbe, ...opts };
  const canvas = view.canvas;
  let downId: number | null = null;
  const place = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const [x, y] = view.toSim(e.clientX - r.left, e.clientY - r.top);
    const Bi = inverse(view.B, 2);
    const f: [number, number] = [wrap01(Bi[0] * x + Bi[1] * y), wrap01(Bi[2] * x + Bi[3] * y)];
    view.sys.probe = { at: f, strength: o.strength, width: o.width };
  };
  const down = (e: PointerEvent) => {
    if (downId !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    downId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    place(e);
    canvas.dataset.touching = "true";
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId === downId) place(e);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== downId) return;
    downId = null;
    view.sys.probe = null;
    delete canvas.dataset.touching;
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
    view.sys.probe = null;
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
