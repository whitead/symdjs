import { describe, expect, it } from "vitest";
import { growProtocol, ProtocolRunner } from "../src/engine/core/protocol";
import { buildSystemData } from "../src/engine/core/system";
import { makeLayout } from "../src/engine/gpu/layout";
import { planeGroup, planeGroups } from "../src/engine/groups/library";
import { plateDefaults } from "../src/site/content/defaults";
import { nCellOf, randomConfigs } from "../src/sim/random";

const L = makeLayout(2);

function fitsGpu(group: ReturnType<typeof planeGroup>, occ: Record<string, number>) {
  const d = buildSystemData(group, occ);
  return d.n <= L.NMAX && d.nCell <= L.IMGMAX && group.order <= L.OPMAX && group.sites.length <= L.SITEMAX;
}

describe("random configurations", () => {
  it("are valid and fit on the GPU", () => {
    for (let seed = 1; seed < 40; seed++) {
      const cfgs = randomConfigs(8, seed);
      expect(new Set(cfgs.map((c) => c.group.name)).size).toBe(8);
      for (const c of cfgs) {
        for (const site of c.group.sites) {
          const k = c.occupancy[site.letter] ?? 0;
          if (site.k === 0) expect(k, `${c.group.name} ${site.letter}`).toBeLessThanOrEqual(1);
        }
        const nc = nCellOf(c.group, c.occupancy);
        expect(nc).toBeGreaterThanOrEqual(6);
        expect(nc).toBeLessThan(120);
        expect(fitsGpu(c.group, c.occupancy)).toBe(true);
      }
    }
  });
});

describe("plate defaults", () => {
  it("cover every group with valid site letters", () => {
    for (const g of planeGroups()) {
      const occ = plateDefaults[g.name];
      expect(occ, g.name).toBeDefined();
      for (const letter of Object.keys(occ)) expect(g.sites.some((s) => s.letter === letter), `${g.name} ${letter}`).toBe(true);
      expect(fitsGpu(g, occ)).toBe(true);
    }
  });
});

describe("protocol runner", () => {
  it("ramps per-orbit temperature and holds the last stage", () => {
    const proto = growProtocol();
    const r = new ProtocolRunner(proto, 4);
    expect(r.params().T).toBeCloseTo(0.5 * 4, 6);
    let steps = 0;
    const total = proto.stages.slice(0, -1).reduce((a, s) => a + s.steps, 0);
    while (steps < total + 10000) {
      r.advance(100);
      steps += 100;
    }
    expect(r.current.name).toBe("crystal");
    expect(r.progress).toBe(1);
    expect(r.params().T).toBeCloseTo(0.04 * 4, 6);
  });
});
