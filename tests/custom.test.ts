import { describe, expect, it } from "vitest";
import { buildCustomGroup, closeGroup, formatOp } from "../src/engine/groups/custom";
import { closureFailure } from "../src/engine/groups/group";
import { planeGroups } from "../src/engine/groups/library";
import { parseOp } from "../src/engine/groups/notation";
import { CpuSim } from "../src/engine/cpu/engine";

describe("custom groups", () => {
  it("regenerate every plane group from its own ops, with the right lattice", () => {
    for (const g of planeGroups()) {
      const r = buildCustomGroup(g.ops.map(formatOp));
      expect(r.error, g.name).toBeUndefined();
      expect(r.group!.order, g.name).toBe(g.order);
      expect(closureFailure(r.group!), g.name).toBeNull();
      // detected lattice is at least as general as the table's
      const rank = { Oblique: 0, Rectangular: 1, Square: 2, Hexagonal: 2 } as const;
      expect(rank[r.group!.lattice as keyof typeof rank]).toBeLessThanOrEqual(rank[g.lattice as keyof typeof rank]);
    }
  });

  it("closes small generator sets", () => {
    expect(closeGroup([parseOp("-y,x", 2)], 2)!.length).toBe(4); // p4
    expect(closeGroup([parseOp("-y,x-y", 2), parseOp("y,x", 2)], 2)!.length).toBe(6); // p31m-like
    const r = buildCustomGroup(["-y,x-y", "-x,-y"]);
    expect(r.group!.order).toBe(6);
    expect(r.group!.lattice).toBe("Hexagonal");
    expect(buildCustomGroup(["-x,y"]).group!.lattice).toBe("Rectangular");
  });

  it("finds standard settings and flags over-constrained cells", () => {
    // threefold written for a 60° cell is rewritten into the 120° setting
    const r60 = buildCustomGroup(["-x-y,x"]);
    expect(r60.error).toBeUndefined();
    expect(r60.group!.lattice).toBe("Hexagonal");
    expect(r60.note).toMatch(/standard setting/);
    // a diagonal mirror allows a rhombic cell; it runs square with a note
    const rh = buildCustomGroup(["y,x"]);
    expect(rh.group!.lattice).toBe("Square");
    expect(rh.note).toMatch(/more general cell/);
    // standard settings need no note
    expect(buildCustomGroup(["-y,x"]).note).toBeUndefined();
  });

  it("rejects non-lattice operations and oversize groups", () => {
    expect(buildCustomGroup(["2x,y"]).error).toBeDefined();
    expect(buildCustomGroup(["x+1/3"]).error).toBeDefined();
    // p6m plus a centring translation has order 24 > 12
    expect(buildCustomGroup(["-y,x-y", "-x,-y", "y,x", "x+1/2,y+1/2"]).error).toBeDefined();
    // mixing square and hexagonal rotations preserves no lattice
    expect(buildCustomGroup(["-y,x", "-y,x-y"]).error).toBeDefined();
  });

  it("simulates", () => {
    const r = buildCustomGroup(["-y,x", "x+1/2,y+1/2"]);
    expect(r.group!.order).toBe(8);
    const sim = new CpuSim({ group: r.group!, occupancy: { a: 3 }, density: 0.4, seed: 1, params: { potential: { kind: "soft", epsilon: 20, sigma: 1, rc: 1.1 } } });
    sim.step(200);
    expect(Number.isFinite(sim.stats().etot)).toBe(true);
  });
});
