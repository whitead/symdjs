// Survey random Wyckoff occupancies per group with the CPU engine.
// Usage: npx tsx scripts/survey.ts <groupName> [count] > out.json

import { CpuSim } from "../src/engine/cpu/engine";
import { growProtocol, ProtocolRunner } from "../src/engine/core/protocol";
import { occupancyLabel } from "../src/engine/core/system";
import { planeGroup } from "../src/engine/groups/library";
import { Rng } from "../src/engine/math/rng";
import { randomOccupancy, nCellOf } from "../src/sim/random";

const [name, countArg = "12"] = process.argv.slice(2);
const group = planeGroup(name);
const rng = new Rng(1234 + group.number);
const seen = new Set<string>();
const out: unknown[] = [];
for (let c = 0; c < Number(countArg) * 3 && out.length < Number(countArg); c++) {
  const occ = randomOccupancy(group, rng, 12 + Math.floor(rng.next() * 36));
  const key = JSON.stringify(occ);
  if (seen.has(key) || nCellOf(group, occ) > 64) continue;
  seen.add(key);
  const sim = new CpuSim({ group, occupancy: occ, density: 0.35, seed: 7 + c });
  const runner = new ProtocolRunner(growProtocol(), sim.data.nCell / sim.data.n);
  let steps = 0;
  while (runner.stage < runner.protocol.stages.length - 1 || runner.stepInStage < runner.current.steps) {
    sim.setParams(runner.params(200));
    sim.step(200);
    runner.advance(200);
    steps += 200;
  }
  const st = sim.stats();
  out.push({ group: name, occ, label: occupancyLabel(group, occ), nCell: sim.data.nCell, n: sim.data.n, pe: +st.pe.toFixed(3), rho: +st.rho.toFixed(3) });
}
console.log(JSON.stringify(out));
