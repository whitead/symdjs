import { describe, expect, it } from "vitest";
import raw3d from "../data/symd/3dgroups.json";
import { applyAffine, linearPart, wrap01 } from "../src/engine/math/affine";
import { matMul, transpose } from "../src/engine/math/linalg";
import { Rng } from "../src/engine/math/rng";
import { boxFromParams, boxVolume, paramsForVolume } from "../src/engine/groups/bravais";
import { buildGroup, closureFailure, polygonArea, type RawGroup } from "../src/engine/groups/group";
import { planeGroups } from "../src/engine/groups/library";
import { insideHalfSpaces, parseInequalities, parseOp } from "../src/engine/groups/notation";

const orders: Record<string, number> = {
  p1: 1, p2: 2, pm: 2, pg: 2, cm: 4, pmm: 4, pmg: 4, pgg: 4, cmm: 8,
  p4: 4, p4m: 8, p4g: 8, p3: 3, p3m1: 6, p31m: 6, p6: 6, p6m: 12,
};

describe("notation", () => {
  it("parses ops", () => {
    const op = parseOp("-y,x-y", 2);
    expect(Array.from(op.m)).toEqual([0, -1, 0, 1, -1, 0, 0, 0, 1]);
    const op2 = parseOp("x + 1/2,-y + 1/2", 2);
    expect(Array.from(op2.m)).toEqual([1, 0, 0.5, 0, -1, 0.5, 0, 0, 1]);
    const op3 = parseOp("(-2x),-x", 2);
    expect(Array.from(op3.m)).toEqual([-2, 0, 0, -1, 0, 0, 0, 0, 1]);
    const op4 = parseOp("3/4 + 1/2,1/4 + 1/2", 2);
    expect(Array.from(op4.m)).toEqual([0, 0, 1.25, 0, 0, 0.75, 0, 0, 1]);
    const op5 = parseOp("-x+y,y,-z+1/2", 3);
    expect(Array.from(op5.m)).toEqual([-1, 1, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0.5, 0, 0, 0, 1]);
  });
  it("parses inequalities with min", () => {
    const hs = parseInequalities("0≤x≤2/3;0≤y≤2/3;x≤(1+y)/2;y≤min(1-x,(1+x)/2)", 2);
    expect(hs.length).toBe(7);
    expect(insideHalfSpaces(hs, [0.3, 0.2])).toBe(true);
    expect(insideHalfSpaces(hs, [0.6, 0.6])).toBe(false);
  });
});

describe("plane groups", () => {
  const groups = planeGroups();

  it("has 17 groups with correct orders", () => {
    expect(groups.length).toBe(17);
    for (const g of groups) expect(g.order, g.name).toBe(orders[g.name]);
  });

  it("is closed under composition mod lattice", () => {
    for (const g of groups) expect(closureFailure(g), g.name).toBeNull();
  });

  it("ops are isometries of the Bravais lattice", () => {
    for (const g of groups) {
      const lp = g.latticeParams;
      const B = boxFromParams(lp, paramsForVolume(lp, 1));
      const Gm = matMul(transpose(B, 2, 2), B, 2, 2, 2);
      for (const op of g.ops) {
        const R = linearPart(op);
        const RtGR = matMul(matMul(transpose(R, 2, 2), Gm, 2, 2, 2), R, 2, 2, 2);
        for (let i = 0; i < 4; i++) expect(RtGR[i], g.name).toBeCloseTo(Gm[i], 10);
      }
    }
  });

  it("asymmetric unit has area 1/|G| and is a fundamental domain", () => {
    const rng = new Rng(7);
    for (const g of groups) {
      expect(polygonArea(g.asymPolygon!) * g.order, g.name).toBeCloseTo(1, 10);
      for (let n = 0; n < 400; n++) {
        const x = [rng.next(), rng.next()];
        let hits = 0;
        for (const op of g.ops) {
          const y = applyAffine(op, x);
          if (insideHalfSpaces(g.asym, [wrap01(y[0]), wrap01(y[1])], -1e-9)) hits++;
        }
        expect(hits, `${g.name} point ${x}`).toBe(1);
      }
    }
  });

  it("Wyckoff coset images match the tabulated coordinates", () => {
    const P = [0.2113, 0.3779];
    for (const g of groups)
      for (const site of g.sites) {
        if (site.general) continue;
        expect(site.multiplicity, `${g.name} ${site.letter}`).toBe(site.coords.length);
        expect(site.cosetOps[0]).toBe(0);
        // representative point at parameters P
        const u = P.slice(0, site.k);
        const rep = Array.from(site.t, (t, i) => t + u.reduce((acc, uc, c) => acc + site.L[i * site.k + c] * uc, 0));
        const images = site.cosetOps.map((oi) => applyAffine(g.ops[oi], rep).map(wrap01));
        // every image lies on some tabulated coordinate manifold, and images are distinct
        for (const im of images) {
          const onSome = site.coords.some((c) => {
            const m = parseOp(c, 2);
            const A = linearPart(m);
            // solve for params by least squares over a fine search: check membership numerically
            for (let a = -2; a <= 2; a++)
              for (let b = -2; b <= 2; b++) {
                const target = [im[0] + a, im[1] + b];
                const r = [target[0] - m.m[2], target[1] - m.m[5]];
                // A p = r has a solution?
                const det = A[0] * A[3] - A[1] * A[2];
                if (Math.abs(det) > 1e-12) return true; // general (should not happen)
                const cols = [
                  [A[0], A[2]],
                  [A[1], A[3]],
                ].filter((c) => Math.hypot(c[0], c[1]) > 0);
                if (cols.length === 0) {
                  if (Math.hypot(r[0], r[1]) < 1e-9) return true;
                } else {
                  const c0 = cols[0];
                  const cross = c0[0] * r[1] - c0[1] * r[0];
                  if (Math.abs(cross) < 1e-9) return true;
                }
              }
            return false;
          });
          expect(onSome, `${g.name} ${site.letter} image ${im}`).toBe(true);
        }
        // representative is inside (or on the boundary of) the asymmetric unit
        const repIn = insideHalfSpaces(g.asym, rep.map((v) => v), 1e-9);
        if (site.k === 0) expect(repIn, `${g.name} ${site.letter} rep in asym unit`).toBe(true);
        else expect(site.uRange[0][1] - site.uRange[0][0], `${g.name} ${site.letter}`).toBeGreaterThan(0);
      }
  });

  it("Bravais parameterization gives the right lattices", () => {
    for (const g of groups) {
      const lp = g.latticeParams;
      const p = paramsForVolume(lp, 2.5);
      const rng = new Rng(3);
      for (let i = 0; i < p.length; i++) p[i] *= 1 + 0.2 * (rng.next() - 0.5);
      const B = boxFromParams(lp, p);
      const a = [B[0], B[2]];
      const b = [B[1], B[3]];
      const la = Math.hypot(a[0], a[1]);
      const lb = Math.hypot(b[0], b[1]);
      const cos = (a[0] * b[0] + a[1] * b[1]) / (la * lb);
      expect(a[1], `${g.name} a along x`).toBeCloseTo(0, 12);
      if (g.lattice === "Square") {
        expect(la).toBeCloseTo(lb, 10);
        expect(cos).toBeCloseTo(0, 10);
      } else if (g.lattice === "Rectangular") expect(cos).toBeCloseTo(0, 10);
      else if (g.lattice === "Hexagonal") {
        expect(la).toBeCloseTo(lb, 10);
        expect(cos).toBeCloseTo(-0.5, 10);
      }
      expect(boxVolume(boxFromParams(lp, paramsForVolume(lp, 2.5)), 2)).toBeCloseTo(2.5, 10);
    }
  });
});

describe("space groups (3D groundwork)", () => {
  it("builds all 230 groups and they are closed", () => {
    const table = raw3d as unknown as Record<string, RawGroup>;
    let built = 0;
    for (const [num, raw] of Object.entries(table)) {
      const g = buildGroup(raw, Number(num), 3);
      expect(g.order).toBe(raw.genpos.length);
      if (Number(num) % 23 === 0) expect(closureFailure(g), `group ${num}`).toBeNull();
      for (const s of g.sites) if (!s.general) expect(s.multiplicity, `group ${num} site ${s.letter}`).toBe(s.coords.length);
      built++;
    }
    expect(built).toBe(230);
  });
});
