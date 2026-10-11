// Symmetry elements of a plane group for International-Tables-style
// diagrams: rotation centres, mirror lines and glide lines, in fractional
// coordinates, clipped to the closed region [0, n]² (n = 1 is the unit cell).

import { linearPart, translationPart } from "../math/affine";
import type { Group } from "./group";

export type Vec2 = [number, number];
export type RotationOrder = 2 | 3 | 4 | 6;

export interface RotationCentre {
  pos: Vec2;
  /** order of the site's rotation subgroup (highest order at this point) */
  order: RotationOrder;
  /** index into group.ops of a rotation of this order about pos (mod lattice) */
  op: number;
}

export interface ReflectionLine {
  /** segment endpoints (the line clipped to the region) */
  p: Vec2;
  q: Vec2;
  /** shortest glide vector (glide lines only) */
  glide?: Vec2;
  /** primitive integer direction, first nonzero component positive */
  dir: Vec2;
  /** the line is { s : ν·s = offset } with integer normal ν = (−dir[1], dir[0]) */
  offset: number;
  /** index into group.ops of the reflection or glide reflection */
  op: number;
}

export interface SymmetryElements2D {
  rotations: RotationCentre[];
  mirrors: ReflectionLine[];
  glides: ReflectionLine[];
}

const TOL = 1e-9;
const ORDER_BY_TRACE: Record<number, RotationOrder> = { [-2]: 2, [-1]: 3, 0: 4, 1: 6 };

/** Snap to multiples of 1/24 (all special coordinates in plane groups) and drop −0. */
function snap(v: number): number {
  const r = Math.round(v * 24) / 24;
  return (Math.abs(v - r) < TOL ? r : v) + 0;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Primitive integer vector along an integer vector, first nonzero component positive. */
function primitive(v: Vec2): Vec2 {
  const x = Math.round(v[0]);
  const y = Math.round(v[1]);
  const g = gcd(x, y) || 1;
  const s = x < 0 || (x === 0 && y < 0) ? -1 : 1;
  return [(s * x) / g + 0, (s * y) / g + 0];
}

const inRegion = (x: Vec2, n: number) => x[0] > -TOL && x[0] < n + TOL && x[1] > -TOL && x[1] < n + TOL;
const posKey = (x: Vec2) => `${Math.round(x[0] * 1e6)},${Math.round(x[1] * 1e6)}`;

/** Clip the line x0 + s·d to [0, n]²; null if it misses or only touches a corner. */
function clipLine(x0: Vec2, d: Vec2, n: number): [Vec2, Vec2] | null {
  let lo = -Infinity;
  let hi = Infinity;
  for (let i = 0; i < 2; i++) {
    if (d[i] === 0) {
      if (x0[i] < -TOL || x0[i] > n + TOL) return null;
    } else {
      const a = -x0[i] / d[i];
      const b = (n - x0[i]) / d[i];
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
  }
  if (hi - lo < TOL) return null;
  const at = (s: number): Vec2 => [snap(x0[0] + s * d[0]), snap(x0[1] + s * d[1])];
  return [at(lo), at(hi)];
}

const cache = new WeakMap<Group, Map<number, SymmetryElements2D>>();

/**
 * All rotation centres, mirror lines and glide lines of a plane group that
 * meet the closed region [0, extent]². Boundary duplicates are included
 * (diagrams draw them). A line that is both a mirror and a glide line is a
 * mirror.
 */
export function symmetryElements(group: Group, extent = 1): SymmetryElements2D {
  if (group.D !== 2) throw new Error("symmetryElements: plane groups only");
  let byExtent = cache.get(group);
  if (!byExtent) cache.set(group, (byExtent = new Map()));
  const hit = byExtent.get(extent);
  if (hit) return hit;

  const N = 2 * Math.ceil(extent) + 3;
  const rot = new Map<string, RotationCentre>();
  const lines = new Map<string, ReflectionLine & { lambda: number }>();

  group.ops.forEach((op, oi) => {
    const R = linearPart(op);
    const t = translationPart(op);
    const det = R[0] * R[3] - R[1] * R[2];
    const tr = Math.round(R[0] + R[3]);
    if (det > 0) {
      if (tr === 2) return; // identity or a pure translation
      const order = ORDER_BY_TRACE[tr];
      // centres solve (I − R) x = t + n
      const a = 1 - R[0];
      const b = -R[1];
      const c = -R[2];
      const d = 1 - R[3];
      const dA = a * d - b * c;
      for (let n1 = -N; n1 <= N; n1++)
        for (let n2 = -N; n2 <= N; n2++) {
          const r0 = t[0] + n1;
          const r1 = t[1] + n2;
          const x: Vec2 = [snap((d * r0 - b * r1) / dA), snap((a * r1 - c * r0) / dA)];
          if (!inRegion(x, extent)) continue;
          const k = posKey(x);
          const prev = rot.get(k);
          if (!prev || prev.order < order) rot.set(k, { pos: x, order, op: oi });
        }
    } else {
      // reflection in Cartesian space: R² = I, so (I ± R)/2 are projectors
      const col0: Vec2 = [1 + R[0], R[2]];
      const col1: Vec2 = [R[1], 1 + R[3]];
      const dir = primitive(Math.hypot(...col0) > 0.5 ? col0 : col1);
      const nu: Vec2 = [-dir[1], dir[0]];
      const dd = dir[0] * dir[0] + dir[1] * dir[1];
      for (let n1 = -N; n1 <= N; n1++)
        for (let n2 = -N; n2 <= N; n2++) {
          const tp: Vec2 = [t[0] + n1, t[1] + n2];
          // glide w = P∥ t′ = λ dir; reduce λ modulo lattice translations along the line
          const w: Vec2 = [((1 + R[0]) * tp[0] + R[1] * tp[1]) / 2, (R[2] * tp[0] + (1 + R[3]) * tp[1]) / 2];
          let lambda = (w[0] * dir[0] + w[1] * dir[1]) / dd;
          lambda -= Math.round(lambda);
          if (Math.abs(lambda + 0.5) < TOL) lambda = 0.5;
          // axis through x0 = P⊥ t′ / 2
          const x0: Vec2 = [((1 - R[0]) * tp[0] - R[1] * tp[1]) / 4, (-R[2] * tp[0] + (1 - R[3]) * tp[1]) / 4];
          const offset = snap(nu[0] * x0[0] + nu[1] * x0[1]);
          const key = `${dir}|${Math.round(offset * 1e6)}`;
          const prev = lines.get(key);
          if (prev) {
            if (Math.abs(lambda) < Math.abs(prev.lambda) - TOL) Object.assign(prev, { lambda, op: oi });
            continue;
          }
          const seg = clipLine(x0, dir, extent);
          if (seg) lines.set(key, { p: seg[0], q: seg[1], dir, offset, op: oi, lambda });
        }
    }
  });

  const rotations = [...rot.values()].sort((u, v) => u.pos[1] - v.pos[1] || u.pos[0] - v.pos[0]);
  const mirrors: ReflectionLine[] = [];
  const glides: ReflectionLine[] = [];
  const sorted = [...lines.values()].sort(
    (u, v) => u.dir[0] - v.dir[0] || u.dir[1] - v.dir[1] || u.offset - v.offset,
  );
  for (const { lambda, ...line } of sorted) {
    if (Math.abs(lambda) < TOL) mirrors.push(line);
    else glides.push({ ...line, glide: [snap(lambda * line.dir[0]), snap(lambda * line.dir[1])] });
  }
  const out = { rotations, mirrors, glides };
  byExtent.set(extent, out);
  return out;
}

export interface ElementCounts {
  /** rotation centres per order, nonzero orders only */
  rotations: Partial<Record<RotationOrder, number>>;
  mirrors: number;
  glides: number;
}

/**
 * Count symmetry elements modulo the lattice: rotation centres in the
 * half-open cell [0, 1)², and lines up to integer translations.
 */
export function countModLattice(el: SymmetryElements2D): ElementCounts {
  const rotations: Partial<Record<RotationOrder, number>> = {};
  for (const r of el.rotations)
    if (r.pos[0] < 1 - TOL && r.pos[1] < 1 - TOL) rotations[r.order] = (rotations[r.order] ?? 0) + 1;
  // translating by an integer vector changes the offset by an integer (ν is primitive)
  const classes = (ls: ReflectionLine[]) =>
    new Set(ls.map((l) => `${l.dir}|${Math.round((l.offset - Math.floor(l.offset + TOL)) * 1e6)}`)).size;
  return { rotations, mirrors: classes(el.mirrors), glides: classes(el.glides) };
}
