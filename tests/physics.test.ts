import { describe, expect, it } from "vitest";
import { planeGroup, planeGroups } from "../src/engine/groups/library";
import { CpuSim } from "../src/engine/cpu/engine";
import type { Group } from "../src/engine/groups/group";
import type { SystemSpec } from "../src/engine/core/system";

/** A representative occupancy: some general reps plus one rep on each of up to two special sites. */
function mixedOccupancy(g: Group, nGeneral = 3): Record<string, number> {
  const occ: Record<string, number> = { [g.sites[g.sites.length - 1].letter]: nGeneral };
  const specials = g.sites.filter((s) => !s.general);
  const line = specials.find((s) => s.k === 1);
  const point = specials.find((s) => s.k === 0);
  if (line) occ[line.letter] = 1;
  if (point) occ[point.letter] = 1;
  return occ;
}

/** Relax random starts with the soft potential, then switch to LJ. */
function relaxed(spec: SystemSpec, steps = 1500): CpuSim {
  const sim = new CpuSim({
    ...spec,
    params: { ...spec.params, potential: { kind: "soft", epsilon: 20, sigma: 1, rc: 1.1 }, gamma: 5, T: 0.5 },
  });
  sim.step(steps);
  sim.setParams({ potential: { kind: "lj", epsilon: 1, sigma: 1, rc: 2.5 }, forceCap: 200, gamma: 5, T: 0.3 });
  sim.step(500);
  sim.setParams({ forceCap: Infinity, ...spec.params });
  return sim;
}

describe("forces are the gradient of U_cell", () => {
  for (const name of ["p1", "p2", "cm", "pmg", "p4m", "p4g", "p3m1", "p6m"]) {
    it(name, () => {
      const g = planeGroup(name);
      const sim = relaxed({ group: g, occupancy: mixedOccupancy(g), density: 0.4, seed: 11 });
      const { D, n, group, siteOf, orbit } = sim.data;
      sim.updatePositions();
      sim.U = sim.computeForces(sim.box, sim.f, sim.e);
      const f0 = Float64Array.from(sim.f);
      const h = 1e-5;
      for (let i = 0; i < n; i++) {
        const site = group.sites[siteOf[i]];
        if (site.k === 0) continue;
        // a random tangent direction in Cartesian space
        const raw = Array.from({ length: D }, (_, a) => Math.sin(3.7 * (i + 1) + 1.3 * a + 0.4));
        const Pv = sim.box.sm.Pv[siteOf[i]];
        const dir = raw.map((_, a) => raw.reduce((acc, r, b) => acc + Pv[a * D + b] * r, 0));
        const Du = sim.box.sm.Du[siteOf[i]];
        const du = Array.from({ length: site.k }, (_, c) => dir.reduce((acc, d, b) => acc + Du[c * D + b] * d, 0));
        const u0 = sim.state.u.slice(i * D, i * D + D);
        const energyAt = (sign: number) => {
          for (let c = 0; c < site.k; c++) sim.state.u[i * D + c] = u0[c] + sign * h * du[c];
          sim.updatePositions();
          return sim.computeForces(sim.box, new Float64Array(n * D), new Float64Array(n));
        };
        const dU = (energyAt(1) - energyAt(-1)) / (2 * h);
        for (let c = 0; c < site.k; c++) sim.state.u[i * D + c] = u0[c];
        sim.updatePositions();
        const fDotDir = dir.reduce((acc, d, a) => acc + d * f0[i * D + a], 0);
        // generalized force on the rep = |orbit| F_i
        expect(dU, `${name} rep ${i} (site ${site.letter})`).toBeCloseTo(-orbit[i] * fDotDir, 3);
      }
    });
  }
});

describe("NVE conserves energy in every plane group", () => {
  for (const g of planeGroups()) {
    it(g.name, () => {
      const sim = relaxed({
        group: g,
        occupancy: mixedOccupancy(g, 2),
        density: 0.5,
        seed: 5,
        params: { gamma: 0, dt: 0.002 },
      });
      sim.setParams({ gamma: 0, dt: 0.002 });
      const e0 = sim.stats().etot;
      let maxDev = 0;
      for (let k = 0; k < 20; k++) {
        sim.step(50);
        maxDev = Math.max(maxDev, Math.abs(sim.stats().etot - e0));
      }
      const scale = Math.max(1, Math.abs(sim.stats().ke));
      expect(maxDev / scale, g.name).toBeLessThan(2e-3);
    });
  }
});

describe("Langevin equipartition with orbit masses", () => {
  it("general and Wyckoff reps both reach T (p4m)", () => {
    const g = planeGroup("p4m");
    const T = 0.8;
    const sim = relaxed({
      group: g,
      occupancy: { g: 3, e: 2, a: 1 },
      density: 0.3,
      seed: 3,
      params: { T, gamma: 10, dt: 0.004 },
    });
    sim.step(2000);
    const { D, n, siteOf, orbit, group } = sim.data;
    const acc = new Map<string, { s: number; c: number }>();
    for (let k = 0; k < 1500; k++) {
      sim.step(20);
      for (let i = 0; i < n; i++) {
        const site = group.sites[siteOf[i]];
        if (site.k === 0) continue;
        let v2 = 0;
        for (let a = 0; a < D; a++) v2 += sim.state.v[i * D + a] ** 2;
        const rec = acc.get(site.letter) ?? { s: 0, c: 0 };
        rec.s += (orbit[i] * v2) / site.k;
        rec.c++;
        acc.set(site.letter, rec);
      }
    }
    for (const [letter, { s, c }] of acc) {
      expect(s / c / T, `site ${letter}`).toBeGreaterThan(0.94);
      expect(s / c / T, `site ${letter}`).toBeLessThan(1.06);
    }
  });
});

describe("NPT samples the right volume distribution", () => {
  // ideal gas (no interactions): p(V) ∝ V^(n_gen + n_line/2) e^(-PV/T) × prior;
  // flat moves in the single lattice parameter a (V ∝ a²) add V^(-1/2).
  for (const [name, occ, nEff] of [
    ["p4", { d: 4 }, 4],
    ["p6m", { f: 2, e: 2, a: 1 }, 3],
  ] as const) {
    it(`${name} ideal gas ⟨V⟩ = (n_eff + ½) T / P`, () => {
      const g = planeGroup(name);
      const T = 1;
      const P = 0.5;
      const sim = new CpuSim({
        group: g,
        occupancy: occ,
        density: 0.3,
        seed: 9,
        params: { T, P, gamma: 1, dt: 0.001, nptEvery: 1, potential: { kind: "soft", epsilon: 0, sigma: 1, rc: 0.05 } },
      });
      sim.step(5000);
      sim.setParams({ mcAdapt: false });
      let sum = 0;
      let cnt = 0;
      for (let k = 0; k < 60000; k++) {
        sim.step(1);
        sum += sim.box.V;
        cnt++;
      }
      const expected = (nEff + 0.5) * (T / P);
      expect(sum / cnt / expected, name).toBeGreaterThan(0.93);
      expect(sum / cnt / expected, name).toBeLessThan(1.07);
    }, 60000);
  }
});
