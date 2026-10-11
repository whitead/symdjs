import { describe, expect, it } from "vitest";
import { applyAffine, linearPart } from "../src/engine/math/affine";
import {
  countModLattice,
  symmetryElements,
  type ReflectionLine,
  type Vec2,
} from "../src/engine/groups/elements2d";
import { opDeterminant } from "../src/engine/groups/group";
import { planeGroups } from "../src/engine/groups/library";

// Rotation centres per order, mirror and glide lines, all modulo the lattice
// (International Tables, Vol. A, plane groups 1-17).
const expected: Record<string, { rot: Record<number, number>; mirrors: number; glides: number }> = {
  p1: { rot: {}, mirrors: 0, glides: 0 },
  p2: { rot: { 2: 4 }, mirrors: 0, glides: 0 },
  pm: { rot: {}, mirrors: 2, glides: 0 },
  pg: { rot: {}, mirrors: 0, glides: 2 },
  cm: { rot: {}, mirrors: 2, glides: 2 },
  pmm: { rot: { 2: 4 }, mirrors: 4, glides: 0 },
  pmg: { rot: { 2: 4 }, mirrors: 2, glides: 2 },
  pgg: { rot: { 2: 4 }, mirrors: 0, glides: 4 },
  cmm: { rot: { 2: 8 }, mirrors: 4, glides: 4 },
  p4: { rot: { 4: 2, 2: 2 }, mirrors: 0, glides: 0 },
  p4m: { rot: { 4: 2, 2: 2 }, mirrors: 6, glides: 2 },
  p4g: { rot: { 4: 2, 2: 2 }, mirrors: 2, glides: 6 },
  p3: { rot: { 3: 3 }, mirrors: 0, glides: 0 },
  p3m1: { rot: { 3: 3 }, mirrors: 3, glides: 3 },
  p31m: { rot: { 3: 3 }, mirrors: 3, glides: 3 },
  p6: { rot: { 6: 1, 3: 2, 2: 3 }, mirrors: 0, glides: 0 },
  p6m: { rot: { 6: 1, 3: 2, 2: 3 }, mirrors: 6, glides: 6 },
};

const groups = planeGroups();
const group = (name: string) => groups.find((g) => g.name === name)!;
const mod1 = (v: number) => {
  const w = v - Math.floor(v + 1e-9);
  return Math.round(w * 1e6) / 1e6;
};
const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-9;

/** Readable line classes mod lattice, e.g. "x=1/4" → "x=0.25". */
function describe2(l: ReflectionLine): string {
  const [dx, dy] = l.dir;
  const [x, y] = l.p;
  if (dx === 0) return `x=${mod1(x)}`;
  if (dy === 0) return `y=${mod1(y)}`;
  if (dx === 1 && dy === 1) return `x-y=${mod1(x - y)}`;
  if (dx === 1 && dy === -1) return `x+y=${mod1(x + y)}`;
  return `${l.dir}:${mod1(l.offset)}`;
}
const classes = (ls: ReflectionLine[]) => [...new Set(ls.map(describe2))].sort();
const mid = (l: ReflectionLine): Vec2 => [(l.p[0] + l.q[0]) / 2, (l.p[1] + l.q[1]) / 2];

describe("plane-group symmetry elements", () => {
  it("counts match the International Tables", () => {
    for (const g of groups) {
      const c = countModLattice(symmetryElements(g));
      const e = expected[g.name];
      expect(c.rotations, `${g.name} rotations`).toEqual(e.rot);
      expect(c.mirrors, `${g.name} mirrors`).toBe(e.mirrors);
      expect(c.glides, `${g.name} glides`).toBe(e.glides);
    }
  });

  it("places lines where the International Tables do", () => {
    const el = (n: string) => symmetryElements(group(n));
    expect(classes(el("pm").mirrors)).toEqual(["x=0", "x=0.5"]);
    expect(classes(el("pg").glides)).toEqual(["x=0", "x=0.5"]);
    expect(classes(el("cm").mirrors)).toEqual(["x=0", "x=0.5"]);
    expect(classes(el("cm").glides)).toEqual(["x=0.25", "x=0.75"]);
    expect(classes(el("pmg").mirrors)).toEqual(["x=0.25", "x=0.75"]);
    expect(classes(el("pmg").glides)).toEqual(["y=0", "y=0.5"]);
    expect(classes(el("pgg").glides)).toEqual(["x=0.25", "x=0.75", "y=0.25", "y=0.75"]);
    expect(classes(el("cmm").mirrors)).toEqual(["x=0", "x=0.5", "y=0", "y=0.5"]);
    expect(classes(el("cmm").glides)).toEqual(["x=0.25", "x=0.75", "y=0.25", "y=0.75"]);
    expect(classes(el("p4m").mirrors)).toEqual(["x+y=0", "x-y=0", "x=0", "x=0.5", "y=0", "y=0.5"]);
    expect(classes(el("p4m").glides)).toEqual(["x+y=0.5", "x-y=0.5"]);
    expect(classes(el("p4g").mirrors)).toEqual(["x+y=0.5", "x-y=0.5"]);
    expect(classes(el("p4g").glides)).toEqual(["x+y=0", "x-y=0", "x=0.25", "x=0.75", "y=0.25", "y=0.75"]);
    // p31m: mirrors along a, b, a+b through the origin, glides halfway between
    expect(classes(el("p31m").mirrors)).toEqual(["x-y=0", "x=0", "y=0"]);
    expect(classes(el("p31m").glides)).toEqual(["x-y=0.5", "x=0.5", "y=0.5"]);
    // p3m1: mirrors normal to a, b, a+b; glides halfway between
    expect(classes(el("p3m1").mirrors)).toEqual(["1,2:0", "2,1:0", "x+y=0"]);
    expect(classes(el("p3m1").glides)).toEqual(["1,2:0.5", "2,1:0.5", "x+y=0.5"]);
    // glide vectors are half a lattice translation along the line
    for (const l of el("p4g").glides) expect(Math.hypot(...l.glide!), describe2(l)).toBeCloseTo(l.dir[0] && l.dir[1] ? Math.SQRT1_2 : 0.5, 12);
  });

  it("includes boundary duplicates in the closed cell", () => {
    expect(symmetryElements(group("p2")).rotations.length).toBe(9);
    expect(symmetryElements(group("p6")).rotations.length).toBe(11);
    expect(symmetryElements(group("pmm")).mirrors.length).toBe(6);
    for (const g of groups) {
      const el = symmetryElements(g);
      const key = (p: number[]) => p.map((v) => Math.round(v * 1e6)).join(",");
      const have = new Set(el.rotations.map((r) => `${r.order}@${key(r.pos)}`));
      for (const r of el.rotations)
        for (const [a, b] of [[1, 0], [0, 1], [1, 1]]) {
          const p = [r.pos[0] + a, r.pos[1] + b];
          if (p[0] <= 1 + 1e-9 && p[1] <= 1 + 1e-9) expect(have.has(`${r.order}@${key(p)}`), `${g.name} ${p}`).toBe(true);
        }
    }
  });

  it("rotation centres are fixed by their op mod lattice", () => {
    const orderOf: Record<number, number> = { [-2]: 2, [-1]: 3, 0: 4, 1: 6 };
    for (const g of groups)
      for (const r of symmetryElements(g).rotations) {
        const op = g.ops[r.op];
        const R = linearPart(op);
        expect(R[0] * R[3] - R[1] * R[2]).toBeCloseTo(1, 12);
        expect(orderOf[Math.round(R[0] + R[3])], `${g.name} ${r.pos}`).toBe(r.order);
        const y = applyAffine(op, r.pos);
        expect(isInt(y[0] - r.pos[0]) && isInt(y[1] - r.pos[1]), `${g.name} ${r.pos}`).toBe(true);
        expect(r.pos.every((v) => v >= 0 && v <= 1)).toBe(true);
      }
  });

  it("mirror lines are pointwise fixed and glide lines are not", () => {
    // s ↦ g(s) − s is the same integer vector at three points of the segment
    const fixesPointwise = (g: (typeof groups)[number], oi: number, l: ReflectionLine) => {
      const d = [l.p, l.q, mid(l)].map((s) => {
        const y = applyAffine(g.ops[oi], s);
        return [y[0] - s[0], y[1] - s[1]];
      });
      return d.every((v) => isInt(v[0]) && isInt(v[1]) && Math.abs(v[0] - d[0][0]) < 1e-9 && Math.abs(v[1] - d[0][1]) < 1e-9);
    };
    for (const g of groups) {
      const el = symmetryElements(g);
      for (const l of [...el.mirrors, ...el.glides]) {
        expect(Math.hypot(l.q[0] - l.p[0], l.q[1] - l.p[1]), g.name).toBeGreaterThan(1e-6);
        for (const s of [l.p, l.q]) expect(s.every((v) => v >= 0 && v <= 1), `${g.name} ${s}`).toBe(true);
      }
      for (const l of el.mirrors) expect(fixesPointwise(g, l.op, l), `${g.name} mirror ${describe2(l)}`).toBe(true);
      for (const l of el.glides) {
        const reflections = g.ops.map((_, i) => i).filter((i) => opDeterminant(g.ops[i]) < 0);
        expect(reflections.some((oi) => fixesPointwise(g, oi, l)), `${g.name} glide ${describe2(l)}`).toBe(false);
        // the glide op maps points on the line to points on the line shifted by w
        for (const s of [l.p, l.q, mid(l)]) {
          const y = applyAffine(g.ops[l.op], s);
          const r = [y[0] - s[0] - l.glide![0], y[1] - s[1] - l.glide![1]];
          expect(isInt(r[0]) && isInt(r[1]), `${g.name} glide ${describe2(l)}`).toBe(true);
        }
        expect(isInt(l.glide![0]) && isInt(l.glide![1])).toBe(false);
      }
    }
  });

  it("counts are independent of the drawn region", () => {
    for (const g of groups) {
      const a = countModLattice(symmetryElements(g, 1));
      const b = countModLattice(symmetryElements(g, 3));
      expect(b, g.name).toEqual(a);
    }
  });
});
